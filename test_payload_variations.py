import requests
import os
import json
from dotenv import load_dotenv

load_dotenv(".env", override=True)

cookie = os.getenv("ML_AFFILIATE_COOKIE", "")
csrf_token = os.getenv("ML_AFFILIATE_CSRF_TOKEN", "")
tag = os.getenv("ML_AFFILIATE_TAG", "shopp-ml2010")

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

url_to_test = "https://www.mercadolivre.com.br/apple-iphone-15-128-gb-preto/p/MLB25954201"
product_id = "MLB25954201"

payloads = [
    # Variation 1: Simple payload (only tag and urls)
    {
        "tag": tag,
        "urls": [url_to_test]
    },
    # Variation 2: Without itemAddToList and itemId
    {
        "tag": tag,
        "type": "product",
        "urls": [url_to_test]
    },
    # Variation 3: type = "user_product" but without itemAddToList
    {
        "tag": tag,
        "type": "user_product",
        "itemId": product_id,
        "urls": [url_to_test]
    },
    # Variation 4: Simple list of URLs
    {
        "tag": tag,
        "urls": [url_to_test],
        "type": "custom"
    }
]

for i, p in enumerate(payloads):
    print(f"\n--- Payload Variation {i+1} ---")
    print(json.dumps(p, indent=2))
    try:
        r = requests.post(target_url, headers=headers, json=p, timeout=10)
        print(f"Status Code: {r.status_code}")
        res_json = r.json()
        print("Response:")
        print(json.dumps(res_json, indent=2))
    except Exception as e:
        print(f"Error: {e}")
