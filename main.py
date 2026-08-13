import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, Depends, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import scheduler
from config import Config
import mailer

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
    SMTP_SERVER: str
    SMTP_PORT: int
    SMTP_USER: str
    SMTP_PASSWORD: str
    RECEIVER_EMAIL: str
    POST_TIMES: str
    ADMIN_PASSWORD: str

class TestEmailSchema(BaseModel):
    SMTP_SERVER: str
    SMTP_PORT: int
    SMTP_USER: str
    SMTP_PASSWORD: str
    RECEIVER_EMAIL: str

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

@app.post("/api/test-email")
def test_email(data: TestEmailSchema):
    # Test SMTP doesn't check local header auth because it's validating raw inputs on the settings screen
    success, message = mailer.send_test_email(
        smtp_server=data.SMTP_SERVER,
        smtp_port=data.SMTP_PORT,
        smtp_user=data.SMTP_USER,
        smtp_password=data.SMTP_PASSWORD,
        receiver_email=data.RECEIVER_EMAIL
    )
    if success:
        return {"status": "success", "message": message}
    else:
        raise HTTPException(status_code=400, detail=message)

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
