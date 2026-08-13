import os
from dotenv import load_dotenv, set_key

# Target .env file path
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

# Ensure .env file exists
if not os.path.exists(ENV_PATH):
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write("# Configurações do Agente de Ofertas Mercado Livre\n")

# Load environment variables
load_dotenv(ENV_PATH, override=True)

class Config:
    @staticmethod
    def get_all():
        # Reload to ensure we get the latest changes
        load_dotenv(ENV_PATH, override=True)
        return {
            "MERCADO_LIVRE_AFFILIATE_ID": os.getenv("MERCADO_LIVRE_AFFILIATE_ID", ""),
            "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY", ""),
            "SMTP_SERVER": os.getenv("SMTP_SERVER", "smtp.gmail.com"),
            "SMTP_PORT": int(os.getenv("SMTP_PORT", "587")),
            "SMTP_USER": os.getenv("SMTP_USER", ""),
            "SMTP_PASSWORD": os.getenv("SMTP_PASSWORD", ""),
            "RECEIVER_EMAIL": os.getenv("RECEIVER_EMAIL", ""),
            "POST_TIMES": os.getenv("POST_TIMES", "09:00,12:30,19:00"),
            "ADMIN_PASSWORD": os.getenv("ADMIN_PASSWORD", "admin"),
        }

    @staticmethod
    def update(settings: dict):
        for key, value in settings.items():
            # Convert port to string if necessary
            str_value = str(value)
            # Write key back to .env file
            set_key(ENV_PATH, key, str_value)
        # Reload environment variables
        load_dotenv(ENV_PATH, override=True)
        return Config.get_all()
