import requests

def test_redirects():
    formats = [
        "https://produto.mercadolivre.com.br/MLB-40366976?affiliate=12345678",
        "https://produto.mercadolivre.com.br/MLB40366976?affiliate=12345678",
        "https://www.mercadolivre.com.br/p/MLB40366976?affiliate=12345678",
        # Let's try the original URL from the scraping with the parameter appended
        "https://www.mercadolivre.com.br/whey-protein-concentrado-1kg-dark-lab-sabor-doce-de-leite/p/MLB40366976?affiliate=12345678"
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    
    for url in formats:
        response = requests.get(url, headers=headers, allow_redirects=True)
        print("-" * 50)
        print("Testing URL:", url)
        print("Final URL  :", response.url)
        print("Status Code:", response.status_code)
        
if __name__ == "__main__":
    test_redirects()
