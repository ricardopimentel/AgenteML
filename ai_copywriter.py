import google.generativeai as genai
from config import Config

def generate_whatsapp_copy(title, price, original_price, discount, link):
    """
    Generates an attractive sales description for WhatsApp.
    If the Gemini key is configured, it calls the Gemini API.
    Otherwise, it falls back to a high-quality template-based generator.
    """
    settings = Config.get_all()
    api_key = settings.get("GEMINI_API_KEY", "")
    
    if not api_key:
        print("Gemini API key not configured. Using template fallback.")
        return generate_template_copy(title, price, original_price, discount, link)
        
    try:
        genai.configure(api_key=api_key)
        # We can use gemini-2.5-flash which is fast and inexpensive
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = f"""
        Você é um especialista em marketing digital e copywriter especializado em vendas em grupos de ofertas no WhatsApp.
        Escreva uma copy de vendas altamente atraente, amigável e persuasiva para o seguinte produto em promoção:
        
        Produto: {title}
        Preço Atual: {price}
        Preço Original: {original_price}
        Desconto: {discount}
        Link de Compra: {link}
        
        Regras da Copy:
        1. Comece com uma chamada forte e emojis chamativos (ex: 🚨 ATENÇÃO, 🔥 IMPERDÍVEL, 💥 MENOR PREÇO).
        2. Destaque o super desconto (ex: "De R$ XXX por apenas R$ YYY - XX% de Desconto!").
        3. Escreva 3 ou 4 tópicos (bullet points) breves destacando os principais benefícios ou utilidade do produto (seja criativo com base no título do produto). Use emojis como marcadores.
        4. Crie senso de urgência sutil (estoque limitado, oferta por tempo limitado).
        5. Finalize com uma chamada clara para ação para clicar no link e comprar.
        6. Mantenha os parágrafos curtos, espaçados e use formatação do WhatsApp (negrito com asteriscos *texto*).
        7. Não coloque nenhuma explicação externa, apenas a mensagem final pronta para copiar e colar no WhatsApp.
        """
        
        response = model.generate_content(prompt)
        copy_text = response.text.strip()
        if copy_text:
            if link and link != "[LINK_AFILIADO]":
                copy_text = copy_text.replace(link, "[LINK_AFILIADO]")
            is_shopee_deal = "shopee" in link.lower() or "shope.ee" in link.lower()
            if is_shopee_deal:
                copy_text = copy_text.replace("Mercado Livre", "Shopee").replace("MercadoLivre", "Shopee")
                copy_text = copy_text.replace("MERCADO LIVRE", "SHOPEE").replace("MERCADOLIVRE", "SHOPEE")
                copy_text = copy_text.replace("mercado livre", "shopee").replace("mercadolivre", "shopee")
            else:
                copy_text = copy_text.replace("Shopee", "Mercado Livre")
                copy_text = copy_text.replace("SHOPEE", "MERCADO LIVRE")
                copy_text = copy_text.replace("shopee", "mercado livre")
            return copy_text
            
    except Exception as e:
        print(f"Gemini API error: {e}. Using template fallback.")
        
    return generate_template_copy(title, price, original_price, discount, link)

def generate_template_copy(title, price, original_price, discount, link):
    """
    Standard template fallback generator.
    """
    original_line = f"~~{original_price}~~ " if original_price else ""
    
    store_name = "Mercado Livre"
    if "shopee" in link.lower() or "shope.ee" in link.lower():
        store_name = "Shopee"
        
    copy = f"""🚨 *OFERTA IMPERDÍVEL NA {store_name.upper()}!* 🚨

🔥 *{title}*

De: {original_line}
Por apenas: *{price}* 😱
💥 *{discount}*

✨ *Por que vale a pena?*
• Produto com excelente custo-benefício
• Garantia e entrega rápida da {store_name}
• Perfeito para o seu dia a dia

⚠️ *Aproveite logo, pois o estoque e a promoção podem acabar a qualquer momento!*

🛒 *Compre com segurança pelo link oficial:*
👉 {link}
"""
    return copy

if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass  # sys.stdout might not support reconfigure in some environments
        
    # Test copywriter (fallback)
    print("Testing copywriter with fallback...")
    sample_copy = generate_whatsapp_copy(
        title="Whey Protein Concentrado 1kg Dark Lab Sabor Doce de leite",
        price="R$147,81",
        original_price="R$349,90",
        discount="57% OFF",
        link="https://www.mercadolivre.com.br/example-product?affiliate=123"
    )
    print(sample_copy)
