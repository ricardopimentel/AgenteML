import requests

def save_html():
    url = "https://www.mercadolivre.com.br/ofertas"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": "https://www.google.com/"
    }
    
    response = requests.get(url, headers=headers)
    print("Scraping Status Code:", response.status_code)
    print("Response Length:", len(response.text))
    with open("response.html", "w", encoding="utf-8") as f:
        f.write(response.text)
    print("HTML saved to response.html")

if __name__ == "__main__":
    save_html()
