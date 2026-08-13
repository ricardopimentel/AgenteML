import requests
from bs4 import BeautifulSoup
import re
import urllib.parse
from config import Config

def scrape_mercado_livre_deals(limit=10, randomize=True):
    import random
    
    # Try a random page between 1 and 10 if randomize is True
    pages_to_try = [random.randint(1, 10)] if randomize else [1]
    if 1 not in pages_to_try:
        pages_to_try.append(1)
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": "https://www.google.com/"
    }
    
    settings = Config.get_all()
    affiliate_id = settings.get("MERCADO_LIVRE_AFFILIATE_ID", "")
    
    for page in pages_to_try:
        url = f"https://www.mercadolivre.com.br/ofertas?page={page}" if page > 1 else "https://www.mercadolivre.com.br/ofertas"
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                continue
                
            soup = BeautifulSoup(response.text, "html.parser")
            cards = soup.find_all(class_="poly-card")
            
            deals = []
            for card in cards:
                # 1. Title & original link
                title_el = card.find(class_="poly-component__title")
                if not title_el:
                    continue
                title = title_el.text.strip()
                original_link = title_el.get("href", "")
                if not original_link:
                    continue
                    
                # Clean original link (remove existing queries)
                parsed_url = urllib.parse.urlparse(original_link)
                clean_link = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
                
                # Construct affiliate link
                if affiliate_id:
                    affiliate_link = f"{clean_link}?affiliate={affiliate_id}"
                else:
                    affiliate_link = clean_link
                    
                # Extract MLB ID
                mlb_match = re.search(r"MLB-?\d+", clean_link)
                mlb_id = mlb_match.group(0).replace("-", "") if mlb_match else "unknown"
                
                # 2. Image URL
                img_el = card.find("img", class_="poly-component__picture")
                image_url = ""
                if img_el:
                    image_url = img_el.get("data-src") or img_el.get("src") or ""
                
                # 3. Pricing
                price_el = card.find(class_="poly-price__amount")
                price_str = price_el.text.strip() if price_el else "Sob Consulta"
                
                prev_price_el = card.find(class_="andes-money-amount--previous")
                original_price = prev_price_el.text.strip() if prev_price_el else ""
                
                # 4. Discount Percentage
                discount = ""
                for text_el in card.find_all(string=True):
                    text_clean = text_el.strip()
                    if re.search(r"\d+%\s*OFF", text_clean):
                        discount = text_clean
                        break
                
                # Calculate discount if not explicitly found
                if not discount and original_price and price_el:
                    try:
                        orig_num = float(re.sub(r"[^\d,]", "", original_price).replace(",", "."))
                        curr_num = float(re.sub(r"[^\d,]", "", price_str).replace(",", "."))
                        if orig_num > curr_num:
                            pct = int(((orig_num - curr_num) / orig_num) * 100)
                            discount = f"{pct}% OFF"
                    except Exception:
                        pass
                
                if discount or original_price:
                    deals.append({
                        "id": mlb_id,
                        "title": title,
                        "original_link": original_link,
                        "affiliate_link": affiliate_link,
                        "price": price_str,
                        "original_price": original_price,
                        "discount": discount or "Promoção",
                        "image_url": image_url
                    })
                    
            if deals:
                if randomize:
                    random.shuffle(deals)
                return deals[:limit]
                
        except Exception as e:
            print(f"Scraper page {page} exception: {e}")
            continue
            
    return []

if __name__ == "__main__":
    # Test scraper
    print("Testing scraper...")
    items = scrape_mercado_livre_deals(5)
    print(f"Found {len(items)} promotional items:")
    for item in items:
        print(f"- {item['title']}")
        print(f"  Price: {item['price']} (Was: {item['original_price']}) | Discount: {item['discount']}")
        print(f"  Link: {item['affiliate_link']}")
        print(f"  Image: {item['image_url']}")
        print()
