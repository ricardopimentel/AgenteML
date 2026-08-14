import requests
from bs4 import BeautifulSoup
import os
import json
from dotenv import load_dotenv

load_dotenv(".env", override=True)

cookie = os.getenv("ML_AFFILIATE_COOKIE", "")
csrf_token = os.getenv("ML_AFFILIATE_CSRF_TOKEN", "")
tag = os.getenv("ML_AFFILIATE_TAG", "shopp-ml2010")

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
}

# Search Mercado Livre for "Kit 50 Cabide Adulto Preto Reforcado"
search_url = "https://lista.mercadolivre.com.br/kit-50-cabide-adulto-preto-reforcado-organizador-combate"
print(f"Searching listings on: {search_url}")

found_urls = []
try:
    r = requests.get(search_url, headers=headers, timeout=10)
    soup = BeautifulSoup(r.text, "html.parser")
    cards = soup.find_all(class_="ui-search-result__wrapper")
    if not cards:
        # Fallback to general cards
        cards = soup.find_all(class_="poly-card")
        
    print(f"Found {len(cards)} listing cards in search.")
    
    for card in cards[:10]:
        title_el = card.find(class_="ui-search-item__title") or card.find(class_="poly-component__title")
        link_el = card.find("a", class_="ui-search-link") or (title_el and title_el.parent) or card.find("a")
        if link_el:
            href = link_el.get("href", "")
            title = title_el.text.strip() if title_el else "Unknown"
            if href and "MLB-" in href:
                # Clean URL
                cleaned_href = href.split("?")[0].split("#")[0]
                found_urls.append((title, cleaned_href))
except Exception as e:
    print(f"Search error: {e}")

# Now test each URL with the affiliate API
target_url = "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink"
headers_api = {
    "Content-Type": "application/json",
    "Cookie": cookie,
    "X-Csrf-Token": csrf_token,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://www.mercadolivre.com.br",
    "Referer": "https://www.mercadolivre.com.br/social/afiliados/links"
}

print(f"\nTesting {len(found_urls)} found listings with Affiliate API:")
for title, url in found_urls:
    print(f"\nTitle: {title}")
    print(f"URL: {url}")
    payload = {
        "tag": tag,
        "urls": [url]
    }
    try:
        r_api = requests.post(target_url, headers=headers_api, json=payload, timeout=10)
        res_data = r_api.json()
        success = res_data.get("total_success", 0)
        print(f"  API Status: {r_api.status_code}")
        print(f"  Success: {success}")
        if success > 0:
            print(f"  Short URL: {res_data['urls'][0]['short_url']}")
            print(f"  Long URL: {res_data['urls'][0]['long_url']}")
        else:
            print(f"  Error Message: {res_data['urls'][0].get('message')}")
    except Exception as e:
        print(f"  Request Error: {e}")
