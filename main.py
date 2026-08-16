import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, Depends, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os
import scheduler
from config import Config

app = FastAPI(title="Agente de Ofertas Mercado Livre")

# Authentication Dependency
def verify_auth(x_admin_password: str = Header(None)):
    settings = Config.get_all()
    correct_password = settings.get("ADMIN_PASSWORD", "admin")
    if not x_admin_password or x_admin_password != correct_password:
        raise HTTPException(status_code=401, detail="Senha de administrador incorreta ou ausente.")

# Define request schemas
class ConfigSchema(BaseModel):
    MERCADO_LIVRE_AFFILIATE_ID: str
    GEMINI_API_KEY: str
    POST_TIMES: str
    ADMIN_PASSWORD: str

class ShortLinkSchema(BaseModel):
    productId: str
    originalUrl: str

class UpdateLinkSchema(BaseModel):
    timestamp: str
    title: str
    affiliate_link: str

class CustomOfferSchema(BaseModel):
    url: str
    title: Optional[str] = None
    price: Optional[str] = None
    image_url: Optional[str] = None
    compare_price: Optional[str] = None
    compare_link: Optional[str] = None
    compare_store: Optional[str] = None

class LoginSchema(BaseModel):
    password: str

# Startup configuration
@app.on_event("startup")
def startup_event():
    scheduler.log_message("Servidor FastAPI inicializado.")
    # Configure and start background scheduler on launch
    scheduler.configure_scheduler()

# Endpoints
@app.post("/api/login")
def login(data: LoginSchema):
    settings = Config.get_all()
    correct_password = settings.get("ADMIN_PASSWORD", "admin")
    if data.password == correct_password:
        return {"status": "success", "message": "Autenticação realizada com sucesso!"}
    else:
        raise HTTPException(status_code=401, detail="Senha incorreta.")

@app.get("/api/config", dependencies=[Depends(verify_auth)])
def get_config():
    return Config.get_all()

@app.post("/api/config", dependencies=[Depends(verify_auth)])
def update_config(config_data: ConfigSchema):
    try:
        new_settings = config_data.dict()
        Config.update(new_settings)
        # Update the running scheduler jobs with the new times
        scheduler.configure_scheduler()
        return {"status": "success", "message": "Configurações atualizadas e tarefas reagendadas!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configurações: {str(e)}")

@app.get("/api/status", dependencies=[Depends(verify_auth)])
def get_status():
    import datetime, pytz
    status_data = scheduler.get_agent_status()
    tz = pytz.timezone("America/Sao_Paulo")
    status_data["server_time_br"] = datetime.datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    return status_data

@app.get("/api/history", dependencies=[Depends(verify_auth)])
def get_history():
    return scheduler.load_history()

@app.get("/api/logs", dependencies=[Depends(verify_auth)])
def get_logs():
    return {"logs": scheduler.get_logs()}

@app.post("/api/trigger", dependencies=[Depends(verify_auth)])
def trigger_agent(background_tasks: BackgroundTasks):
    # Runs the agent flow asynchronously so the API response returns immediately
    background_tasks.add_task(scheduler.run_agent_flow)
    return {"status": "success", "message": "Fluxo do agente disparado em segundo plano!"}


@app.post("/api/generate-custom-offer", dependencies=[Depends(verify_auth)])
def generate_custom_offer(data: CustomOfferSchema):
    import requests
    import urllib.parse
    import re
    from bs4 import BeautifulSoup
    import ai_copywriter

    url = data.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Por favor, forneça uma URL válida.")
        
    # 1. Resolve redirect to get final URL
    resolved_url = url
    try:
        r_resolve = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, allow_redirects=True, timeout=10)
        resolved_url = r_resolve.url
    except Exception:
        pass

    parsed = urllib.parse.urlparse(resolved_url)
    
    # 2. Determine platform
    is_shopee = "shopee.com.br" in parsed.netloc or "shope.ee" in parsed.netloc
    is_meli = "mercadolivre.com.br" in parsed.netloc or "mercadolibre.com" in parsed.netloc
    
    if not is_shopee and not is_meli:
        raise HTTPException(status_code=400, detail="A URL fornecida não é do Mercado Livre ou da Shopee.")
        
    title = ""
    price_str = "Sob Consulta"
    original_price = ""
    discount = ""
    image_url = ""
    item_compare = None
    
    # 3. Handle Shopee Link
    if is_shopee:
        if data.title:
            title = data.title.strip()
            price_str = data.price.strip() if data.price else "Sob Consulta"
            image_url = data.image_url.strip() if data.image_url else "https://deo.shopeemobile.com/shopee/shopee-pcmall-live-sg/assets/ca5d10df1fb01a8f66086733613696fe.png"
        else:
            # Parse Shopee slug from resolved URL
            path = parsed.path.strip("/")
            last_segment = path.split("/")[-1] if "/" in path else path
            if "-i." in last_segment:
                slug = last_segment.split("-i.")[0]
                title = slug.replace("-", " ").strip()
            elif last_segment.startswith("product/") or (len(path.split("/")) >= 3 and path.split("/")[0] == "product"):
                title = "Produto Shopee"
            else:
                title = last_segment.replace("-", " ").strip()
                
            price_str = "Sob Consulta"
            image_url = "https://deo.shopeemobile.com/shopee/shopee-pcmall-live-sg/assets/ca5d10df1fb01a8f66086733613696fe.png"

        # Search comparison on Mercado Livre by scraping the search listing page via translate mirror
        ml_image_url = ""
        if title and title != "Produto Shopee":
            try:
                # Use first 5 words to keep search general and robust
                q_short = " ".join(title.split()[:5])
                slug = q_short.replace(" ", "-")
                slug = re.sub(r"[^\w\-]", "", slug)
                
                ml_search_url = f"https://lista-mercadolivre-com-br.translate.goog/{slug}?_x_tr_sl=auto&_x_tr_tl=pt&_x_tr_hl=pt-BR"
                
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
                }
                search_resp = requests.get(ml_search_url, headers=headers, timeout=10)
                if search_resp.status_code == 200:
                    search_soup = BeautifulSoup(search_resp.text, "html.parser")
                    items = search_soup.find_all(class_="ui-search-result__wrapper") or search_soup.find_all(class_="ui-search-item")
                    if items:
                        best_match = items[0]
                        # 1. Price
                        price_fraction = best_match.find(class_="andes-money-amount__fraction")
                        ml_price_num = 0.0
                        ml_price_str = ""
                        if price_fraction:
                            try:
                                ml_price_str = f"R$ {price_fraction.text.strip()}"
                                ml_price_num = float(re.sub(r"[^\d]", "", price_fraction.text))
                            except Exception:
                                pass
                        
                        # 2. Link
                        link_el = best_match.find("a")
                        link = link_el.get("href") if link_el else ""
                        original_link = ""
                        if link:
                            try:
                                parsed_link = urllib.parse.urlparse(link)
                                qs = urllib.parse.parse_qs(parsed_link.query)
                                if "u" in qs:
                                    original_link = qs["u"][0]
                                else:
                                    original_link = link
                            except Exception:
                                original_link = link
                                
                        # 3. Image
                        img_el = best_match.find("img")
                        if img_el:
                            ml_image_url = img_el.get("data-src") or img_el.get("src") or ""
                                
                        # Compare
                        shopee_price_num = 0.0
                        try:
                            cleaned_price = re.sub(r"[^\d]", "", price_str)
                            shopee_price_num = float(cleaned_price)
                        except Exception:
                            pass
                            
                        if ml_price_num > 0 and (shopee_price_num == 0.0 or ml_price_num < shopee_price_num):
                            item_compare = {
                                "price": ml_price_str or f"R$ {ml_price_num:.2f}".replace(".", ","),
                                "link": original_link,
                                "store": "Mercado Livre"
                            }
            except Exception as compare_err:
                print(f"Error comparing price on ML search scraping: {compare_err}")
                
        # If we got a real image from the search match, swap the default Shopee static placeholder
        if ml_image_url and (not image_url or "shopeemobile.com/shopee" in image_url):
            image_url = ml_image_url
            
    # 4. Handle Mercado Livre Link
    elif is_meli:
        if data.title:
            title = data.title.strip()
            price_str = data.price.strip() if data.price else "Sob Consulta"
            image_url = data.image_url.strip() if data.image_url else ""
        else:
            is_social = "/social/" in parsed.path
            prefix = "www"
            if "produto" in parsed.netloc:
                prefix = "produto"
                
            mirror_domain = f"{prefix}-mercadolivre-com-br.translate.goog"
            # Keep query parameters for social pages so highlight details load correctly
            mirror_url = f"https://{mirror_domain}{parsed.path}?{parsed.query}&_x_tr_sl=auto&_x_tr_tl=pt&_x_tr_hl=pt-BR"
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                "Accept-Language": "pt-BR,pt;q=0.9"
            }
            
            try:
                response = requests.get(mirror_url, headers=headers, timeout=15)
                if response.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Erro ao acessar espelho do produto (Status {response.status_code}).")
                    
                soup = BeautifulSoup(response.text, "html.parser")
                
                if is_social:
                    card = soup.find(class_="poly-card")
                    if not card:
                        raise HTTPException(status_code=404, detail="Não foi possível identificar o produto destacado na página social.")
                        
                    # 1. Title Extraction
                    title_el = card.find(class_="poly-component__title")
                    title = title_el.text.strip() if title_el else "Produto Mercado Livre"
                    if " - Google Tradutor" in title:
                        title = title.replace(" - Google Tradutor", "")
                        
                    # 2. Image Extraction
                    img_el = card.find("img", class_="poly-component__picture")
                    image_url = ""
                    if img_el:
                        image_url = img_el.get("data-src") or img_el.get("src") or ""
                        
                    # 3. Price & Discount Extraction
                    prev_el = card.find(class_="andes-money-amount--previous")
                    original_price = prev_el.text.strip() if prev_el else ""
                    
                    # Filter current price
                    money_elements = card.find_all(class_="andes-money-amount")
                    price_str = "Sob Consulta"
                    for el in money_elements:
                        if "andes-money-amount--previous" not in el.get("class", []):
                            price_str = el.text.strip()
                            break
                            
                    disc_el = card.find(class_="andes-money-amount__discount")
                    discount = disc_el.text.strip() if disc_el else ""
                else:
                    # 1. Title Extraction
                    title_meta = soup.find("meta", property="og:title")
                    title = title_meta.get("content") if title_meta else None
                    if not title:
                        title_h1 = soup.find("h1")
                        title = title_h1.text.strip() if title_h1 else "Produto Mercado Livre"
                        
                    if " - Google Tradutor" in title:
                        title = title.replace(" - Google Tradutor", "")
                        
                    # 2. Image Extraction
                    image_meta = soup.find("meta", property="og:image")
                    image_url = image_meta.get("content") if image_meta else ""
                    if not image_url:
                        img_el = soup.find("img", class_="ui-pdp-image") or soup.find("img", class_="ui-pdp-gallery__figure__image")
                        image_url = img_el.get("src") if img_el else ""
                        
                    # 3. Price & Discount Extraction
                    price_meta = soup.find("meta", itemprop="price")
                    price_val = price_meta.get("content") if price_meta else None
                    
                    if price_val:
                        try:
                            price_float = float(price_val)
                            if price_float.is_integer():
                                price_str = f"R${int(price_float)}"
                            else:
                                price_str = f"R${price_float:.2f}".replace(".", ",")
                        except Exception:
                            price_str = f"R${price_val}"
                    else:
                        price_fraction_el = soup.select_one(".ui-pdp-price__second-line .andes-money-amount__fraction") or soup.find(class_="andes-money-amount__fraction")
                        price_str = f"R${price_fraction_el.text.strip()}" if price_fraction_el else "Sob Consulta"
                        
                    prev_el = soup.find(class_="andes-money-amount--previous")
                    original_price = ""
                    if prev_el:
                        prev_fraction = prev_el.find(class_="andes-money-amount__fraction")
                        if prev_fraction:
                            original_price = f"R${prev_fraction.text.strip()}"
                            
                    disc_el = soup.find(class_="andes-money-amount__discount")
                    discount = ""
                    if disc_el:
                        discount = disc_el.text.strip()
                    
                # Common discount calculation fallback
                if not discount and original_price and price_str != "Sob Consulta":
                    try:
                        orig_num = float(re.sub(r"[^\d,]", "", original_price).replace(",", "."))
                        curr_num = float(re.sub(r"[^\d,]", "", price_str).replace(",", "."))
                        if orig_num > curr_num:
                            pct = int(((orig_num - curr_num) / orig_num) * 100)
                            discount = f"{pct}% OFF"
                    except Exception:
                        pass
                        
            except requests.exceptions.RequestException as e:
                raise HTTPException(status_code=502, detail=f"Erro de rede ao acessar o produto: {str(e)}")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Erro ao processar produto: {str(e)}")

    # 5. Extract comparison data from input or query
    comparison = None
    if data.compare_price:
        comparison = {
            "price": data.compare_price.strip(),
            "link": data.compare_link.strip() if data.compare_link else "",
            "store": data.compare_store.strip() if data.compare_store else "Outra Loja"
        }
    elif item_compare:
        comparison = item_compare

    # 6. Generate AI Copy
    copy = ai_copywriter.generate_whatsapp_copy(
        title=title,
        price=price_str,
        original_price=original_price,
        discount=discount or "Promoção",
        link=url  # Populate the input affiliate link directly!
    )
    
    return {
        "status": "success",
        "item": {
            "title": title,
            "price": price_str,
            "original_price": original_price,
            "discount": discount or "Promoção",
            "original_link": resolved_url,
            "image_url": image_url,
            "copy": copy,
            "affiliate_link": url,
            "comparison": comparison
        }
    }


@app.get("/api/proxy-image")
def proxy_image(url: str):
    import requests
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"))
        raise HTTPException(status_code=r.status_code, detail="Failed to fetch image from source")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/update-affiliate-link")
def update_affiliate_link(data: UpdateLinkSchema):
    import json
    history = scheduler.load_history()
    updated = False
    for entry in history:
        if entry.get("timestamp") == data.timestamp:
            for item in entry.get("items", []):
                if item.get("title") == data.title:
                    item["affiliate_link"] = data.affiliate_link
                    updated = True
                    break
            if updated:
                break
                
    if not updated:
        raise HTTPException(status_code=404, detail="Produto não encontrado no histórico.")
        
    try:
        with open(scheduler.HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=4, ensure_ascii=False)
        return {"status": "success", "message": "Link de afiliado atualizado!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar histórico: {str(e)}")

# Mount static files from renamed directory "public".
public_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
if not os.path.exists(public_dir):
    os.makedirs(public_dir)

app.mount("/", StaticFiles(directory=public_dir, html=True), name="static")

if __name__ == "__main__":
    # Start uvicorn server, reading port from env if present (like in Render)
    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    reload_opt = True if host == "127.0.0.1" else False
    uvicorn.run("main:app", host=host, port=port, reload=reload_opt)
