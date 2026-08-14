import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, Depends, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
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
    ML_AFFILIATE_COOKIE: str
    ML_AFFILIATE_CSRF_TOKEN: str
    ML_AFFILIATE_TAG: str

class ShortLinkSchema(BaseModel):
    productId: str
    originalUrl: str

class UpdateLinkSchema(BaseModel):
    timestamp: str
    title: str
    affiliate_link: str

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


@app.post("/api/shorten-link", dependencies=[Depends(verify_auth)])
def shorten_link(data: ShortLinkSchema):
    import requests
    # Retrieve cookie and token from env
    cookie = os.getenv("ML_AFFILIATE_COOKIE", "")
    csrf_token = os.getenv("ML_AFFILIATE_CSRF_TOKEN", "")
    
    if not cookie or not csrf_token:
        raise HTTPException(
            status_code=400,
            detail="Credenciais PWA do Mercado Livre ausentes no arquivo .env (ML_AFFILIATE_COOKIE e ML_AFFILIATE_CSRF_TOKEN)."
        )
        
    target_url = "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink"
    
    headers = {
        "Content-Type": "application/json",
        "Cookie": cookie,
        "X-Csrf-Token": csrf_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Origin": "https://www.mercadolivre.com.br",
        "Referer": "https://www.mercadolivre.com.br/social/afiliados/links"
    }
    
    tag = os.getenv("ML_AFFILIATE_TAG", "shopp-ml2010")
    payload = {
        "itemId": data.productId,
        "itemAddToList": data.productId,
        "tag": tag,
        "type": "user_product",
        "buyBoxWinner": data.productId,
        "extraCommission": "true",
        "urls": [data.originalUrl]
    }
    
    try:
        response = requests.post(target_url, headers=headers, json=payload, timeout=15)
        
        if response.status_code in [401, 403]:
            raise HTTPException(
                status_code=401,
                detail="Sessão expirada - Atualize os cookies no .env"
            )
            
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Erro do Mercado Livre (Status {response.status_code}): {response.text}"
            )
            
        res_data = response.json()
        short_url = res_data.get("short_url")
        
        if not short_url:
            # Fallback check if structure is nested
            if isinstance(res_data, list) and len(res_data) > 0:
                short_url = res_data[0].get("short_url")
            elif isinstance(res_data, dict) and "urls" in res_data:
                urls = res_data.get("urls", [])
                if urls and isinstance(urls, list) and isinstance(urls[0], dict):
                    short_url = urls[0].get("short_url")
                    
        if not short_url:
            raise HTTPException(
                status_code=522,
                detail=f"Resposta recebida sem short_url: {res_data}"
            )
            
        return {"status": "success", "short_url": short_url}
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Falha de rede ao conectar com Mercado Livre: {str(e)}"
        )


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
