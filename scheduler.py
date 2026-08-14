import datetime
import json
import os
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from config import Config
import scraper
import ai_copywriter

# Path to local history file
HISTORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history.json")
LOGS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.log")

scheduler = BackgroundScheduler()

# Global memory in case file write fails
latest_run_status = {
    "status": "Não executado",
    "timestamp": None,
    "items_count": 0,
    "error": None
}

def log_message(message):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {message}\n"
    with open(LOGS_PATH, "a", encoding="utf-8") as f:
        f.write(formatted)
    print(message)

def get_logs():
    if not os.path.exists(LOGS_PATH):
        return "Nenhum log disponível."
    try:
        with open(LOGS_PATH, "r", encoding="utf-8") as f:
            # Return last 100 lines of log
            lines = f.readlines()
            return "".join(lines[-100:])
    except Exception as e:
        return f"Erro ao carregar logs: {e}"

def load_history():
    if not os.path.exists(HISTORY_PATH):
        return []
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading history.json: {e}")
        return []

def save_to_history(run_entry):
    try:
        history = load_history()
        # Prepend new run to show newest first
        history.insert(0, run_entry)
        # Limit history to last 20 runs
        history = history[:20]
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving history.json: {e}")

def run_agent_flow():
    """
    Executes the full flow:
    1. Scrapes daily deals
    2. Writes sales copies using Gemini (or fallback template)
    3. Emails the copies and attached images to the user
    4. Updates history and logs
    """
    global latest_run_status
    log_message("Iniciando execução do fluxo do agente...")
    
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    latest_run_status = {
        "status": "Executando",
        "timestamp": timestamp_str,
        "items_count": 0,
        "error": None
    }
    
    try:
        # 1. Scrape deals
        log_message("Buscando ofertas do dia no Mercado Livre...")
        deals = scraper.scrape_mercado_livre_deals(limit=5)
        
        if not deals:
            log_message("Nenhuma oferta promocional encontrada na busca.")
            latest_run_status.update({
                "status": "Sucesso (Sem Ofertas)",
                "error": "Nenhuma oferta encontrada para os critérios especificados."
            })
            return
            
        log_message(f"Encontradas {len(deals)} ofertas promocionais. Gerando copies de venda...")
        
        # 2. Generate copies
        copy_texts = []
        for i, deal in enumerate(deals):
            log_message(f"Processando item {i+1}/{len(deals)}: {deal['title'][:40]}...")
            copy = ai_copywriter.generate_whatsapp_copy(
                title=deal["title"],
                price=deal["price"],
                original_price=deal["original_price"],
                discount=deal["discount"],
                link="[LINK_AFILIADO]"
            )
            copy_texts.append(copy)
            
        # 3. Save to history
        log_message("Salvando ofertas estruturadas no histórico local...")
        run_entry = {
            "timestamp": timestamp_str,
            "items": [
                {
                    "title": deal["title"],
                    "price": deal["price"],
                    "original_price": deal["original_price"],
                    "discount": deal["discount"],
                    "original_link": deal["original_link"],
                    "affiliate_link": deal["affiliate_link"],
                    "image_url": deal["image_url"],
                    "copy": copy
                }
                for deal, copy in zip(deals, copy_texts)
            ]
        }
        save_to_history(run_entry)
        
        latest_run_status.update({
            "status": "Sucesso",
            "items_count": len(deals)
        })
        log_message("Fluxo executado e ofertas salvas com sucesso no histórico!")
            
    except Exception as e:
        err_msg = f"Erro geral na execução: {str(e)}"
        log_message(err_msg)
        latest_run_status.update({
            "status": "Erro Geral",
            "error": err_msg
        })

def configure_scheduler():
    """
    Clears current jobs and sets new cron jobs based on config.py settings.
    """
    if not scheduler.running:
        scheduler.start()
        log_message("Serviço de agendamento inicializado.")
        
    # Clear existing jobs
    for job in scheduler.get_jobs():
        scheduler.remove_job(job.id)
        
    settings = Config.get_all()
    post_times = settings.get("POST_TIMES", "09:00,12:30,19:00")
    
    if not post_times:
        log_message("Nenhum horário de postagem configurado. Agendador em espera.")
        return
        
    times = [t.strip() for t in post_times.split(",") if t.strip()]
    
    job_count = 0
    for time_str in times:
        try:
            if ":" not in time_str:
                continue
            hour_str, minute_str = time_str.split(":")
            hour = int(hour_str)
            minute = int(minute_str)
            
            job_id = f"deals_job_{hour:02d}_{minute:02d}"
            
            import pytz
            tz = pytz.timezone("America/Sao_Paulo")
            
            scheduler.add_job(
                run_agent_flow,
                trigger=CronTrigger(hour=hour, minute=minute, timezone=tz),
                id=job_id,
                name=f"Envio de Ofertas {hour:02d}:{minute:02d}"
            )
            job_count += 1
            log_message(f"Tarefa agendada para as {hour:02d}:{minute:02d} (ID: {job_id})")
        except Exception as e:
            log_message(f"Erro ao agendar horário '{time_str}': {e}")
            
    log_message(f"Configuração do agendador concluída. {job_count} tarefas ativas.")

def get_next_run():
    """
    Returns the timestamp of the next scheduled task execution in America/Sao_Paulo timezone.
    """
    jobs = scheduler.get_jobs()
    if not jobs:
        return None
    # Find the job with the closest next run time
    next_runs = [job.next_run_time for job in jobs if job.next_run_time]
    if not next_runs:
        return None
    
    import pytz
    br_tz = pytz.timezone("America/Sao_Paulo")
    closest_run = min(next_runs)
    
    if closest_run.tzinfo:
        closest_run = closest_run.astimezone(br_tz)
        
    return closest_run.strftime("%d/%m/%Y %H:%M:%S")

def get_agent_status():
    """
    Returns general stats for the dashboard.
    """
    import pytz
    br_tz = pytz.timezone("America/Sao_Paulo")
    
    return {
        "scheduler_running": scheduler.running,
        "jobs": [
            {"id": job.id, "name": job.name, "next_run": job.next_run_time.astimezone(br_tz).strftime("%d/%m/%Y %H:%M:%S") if job.next_run_time else "Pausado"}
            for job in scheduler.get_jobs()
        ],
        "next_run": get_next_run(),
        "latest_run": latest_run_status
    }
