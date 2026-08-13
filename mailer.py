import smtplib
import requests
import re
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from config import Config

def clean_filename(title):
    # Remove non-alphanumeric characters and replace spaces with underscores
    cleaned = re.sub(r"[^\w\s-]", "", title)
    cleaned = re.sub(r"[\s-]+", "_", cleaned).strip("_")
    return cleaned[:30].lower()

def send_deals_email(deals, copy_texts):
    """
    Sends an email containing the scraped deals, formatted copies, and attached product images.
    deals: list of dicts from scraper
    copy_texts: list of generated copy strings (same index as deals)
    """
    settings = Config.get_all()
    
    smtp_server = settings.get("SMTP_SERVER", "")
    smtp_port = settings.get("SMTP_PORT", 587)
    smtp_user = settings.get("SMTP_USER", "")
    smtp_password = settings.get("SMTP_PASSWORD", "")
    receiver_email = settings.get("RECEIVER_EMAIL", "")
    
    if not smtp_user or not smtp_password or not receiver_email:
        print("SMTP credentials or receiver email not configured.")
        return False, "Credenciais de e-mail ou destinatário não configurados."
        
    try:
        # Create message container
        msg = MIMEMultipart("related")
        msg["Subject"] = "🤖 Seu Agente ML: Ofertas Prontas para o WhatsApp!"
        msg["From"] = smtp_user
        msg["To"] = receiver_email
        
        # Create HTML Body
        html_content = """
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 600px; background-color: #ffffff; margin: 0 auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #ddd; }
                .header { background: linear-gradient(135deg, #ffd700, #ffb700); padding: 20px; text-align: center; color: #111; font-weight: bold; font-size: 20px; }
                .deal-card { padding: 20px; border-bottom: 1px solid #eee; }
                .deal-card:last-child { border-bottom: none; }
                .deal-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #111; }
                .deal-meta { color: #888; font-size: 13px; margin-bottom: 10px; }
                .price-tag { font-size: 18px; color: #e63946; font-weight: bold; }
                .old-price { text-decoration: line-through; color: #999; font-size: 14px; margin-right: 8px; }
                .discount-badge { background-color: #2a9d8f; color: white; padding: 3px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px; font-weight: bold; }
                .copy-box { background-color: #f8f9fa; border-left: 4px solid #3483fa; padding: 15px; margin: 15px 0; font-family: Courier, monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; border-radius: 0 4px 4px 0; }
                .link-btn { display: inline-block; background-color: #3483fa; color: white !important; text-decoration: none; padding: 8px 16px; border-radius: 4px; font-size: 14px; font-weight: bold; margin-top: 10px; }
                .footer { background-color: #222; color: #999; text-align: center; padding: 15px; font-size: 12px; }
                .image-container { text-align: center; margin: 15px 0; }
                .product-img { max-width: 100%; max-height: 250px; border-radius: 4px; border: 1px solid #ddd; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    🤖 AGENTE AFILIADO MERCADO LIVRE<br>
                    <span style="font-size: 14px; font-weight: normal;">Suas ofertas do dia estão prontas!</span>
                </div>
        """
        
        # We will keep track of attached images to reference in HTML via CID
        images_to_attach = []
        
        for i, (deal, copy_text) in enumerate(zip(deals, copy_texts)):
            image_cid = f"image_deal_{i}"
            clean_name = clean_filename(deal["title"])
            
            # Formulate local file name and attachment info
            filename = f"{i+1}_{clean_name}.jpg"
            
            image_data = None
            if deal["image_url"]:
                try:
                    img_response = requests.get(deal["image_url"], timeout=10)
                    if img_response.status_code == 200:
                        image_data = img_response.content
                except Exception as e:
                    print(f"Failed to download image for deal {i}: {e}")
            
            # If successfully downloaded image, add it to list to embed
            if image_data:
                images_to_attach.append({
                    "cid": image_cid,
                    "data": image_data,
                    "filename": filename
                })
                img_tag = f'<img src="cid:{image_cid}" class="product-img" alt="Produto">'
            else:
                # Fallback to direct URL in HTML if download failed
                img_tag = f'<img src="{deal["image_url"]}" class="product-img" alt="Produto">' if deal["image_url"] else ""
                
            discount_html = f'<span class="discount-badge">{deal["discount"]}</span>' if deal["discount"] else ""
            old_price_html = f'<span class="old-price">{deal["original_price"]}</span>' if deal["original_price"] else ""
            
            html_content += f"""
                <div class="deal-card">
                    <div class="deal-title">{deal["title"]}</div>
                    <div class="deal-meta">ID do Produto: {deal["id"]}</div>
                    <div class="image-container">
                        {img_tag}
                    </div>
                    <div>
                        {old_price_html}
                        <span class="price-tag">{deal["price"]}</span>
                        {discount_html}
                    </div>
                    
                    <div style="margin-top: 15px; font-weight: bold; font-size: 13px; color: #444;">Copy para o WhatsApp:</div>
                    <div class="copy-box">{copy_text}</div>
                    
                    <a href="{deal["affiliate_link"]}" class="link-btn" target="_blank">Ver Produto no Mercado Livre</a>
                </div>
            """
            
        html_content += """
                <div class="footer">
                    Este e-mail foi gerado automaticamente pelo seu Agente de IA do Mercado Livre.<br>
                    Configure seus horários e chaves a qualquer momento pelo Painel de Controle local.
                </div>
            </div>
        </body>
        </html>
        """
        
        # Attach the HTML content
        msg_alternative = MIMEMultipart("alternative")
        msg.attach(msg_alternative)
        msg_alternative.attach(MIMEText(html_content, "html", "utf-8"))
        
        # Attach images with correct content ID and standard attachment disposition
        for img in images_to_attach:
            # We use MIMEImage to create the attachment
            # Detect file type or fallback to jpeg
            mime_img = MIMEImage(img["data"])
            mime_img.add_header("Content-ID", f"<{img['cid']}>")
            mime_img.add_header("Content-Disposition", "attachment", filename=img["filename"])
            msg.attach(mime_img)
            
        # SMTP Session
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, receiver_email, msg.as_string())
        server.quit()
        
        return True, "E-mail enviado com sucesso!"
        
    except Exception as e:
        print(f"SMTP error: {e}")
        return False, f"Falha ao enviar e-mail: {str(e)}"

def send_test_email(smtp_server, smtp_port, smtp_user, smtp_password, receiver_email):
    """
    Sends a simple validation email to verify SMTP configuration.
    """
    try:
        msg = MIMEMultipart()
        msg["Subject"] = "🤖 Teste de Conexão: Agente Mercado Livre"
        msg["From"] = smtp_user
        msg["To"] = receiver_email
        
        body = """Olá!
        
Este é um e-mail de teste enviado pelo seu Agente de IA de Afiliados do Mercado Livre.
Se você recebeu esta mensagem, suas configurações de e-mail (SMTP) estão 100% corretas e ativas!

Próximos passos:
1. Adicione sua chave do Gemini para obter copies de venda personalizadas.
2. Certifique-se de preencher seu ID de Afiliado para rastrear suas comissões.
3. Configure os horários de disparo para automatizar o envio diário.

Abraços do seu Agente de IA!"""
        
        msg.attach(MIMEText(body, "plain", "utf-8"))
        
        server = smtplib.SMTP(smtp_server, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, receiver_email, msg.as_string())
        server.quit()
        
        return True, "E-mail de teste enviado com sucesso!"
    except Exception as e:
        print(f"Test email error: {e}")
        return False, f"Falha no teste: {str(e)}"
