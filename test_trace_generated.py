import requests

url = "https://meli.la/2AN9B2g"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
}

try:
    print(f"Tracing redirects for {url}...")
    r = requests.get(url, headers=headers, allow_redirects=True)
    print(f"Final URL: {r.url}")
    print(f"History of redirects:")
    for resp in r.history:
        print(f"  {resp.status_code}: {resp.url}")
except Exception as e:
    print(f"Error: {e}")
