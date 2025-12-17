# scripts/service.py
import os
import asyncio
import schedule
import time
import httpx
import math
from contextlib import asynccontextmanager
from threading import Thread
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Import logic from your existing scripts
from scripts.update_jobs import fetch_new_jobs, upsert_jobs
from scripts.enrich_jobs import enrich_job_vectors
from scripts.geocode_jobs import geocode_new_jobs

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2")
DIMS = 1024

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helper: Normalization ---
def normalize_vector(vector: list[float]) -> list[float]:
    if not vector:
        return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * len(vector)
    return [x / magnitude for x in vector]

# --- Helper: Ollama Call ---
async def fetch_embedding(text: str):
    """Generates an embedding from Ollama"""
    if not text or not text.strip():
        return {"vector": None}
        
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                OLLAMA_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text}
            )
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding")
            
            if not embedding or len(embedding) != DIMS:
                error_msg = f"Ollama returned invalid dims. Expected {DIMS}, got {len(embedding) if embedding else 0}"
                print(f"❌ {error_msg}")
                raise ValueError(error_msg)
                
            return {"vector": normalize_vector(embedding)}
            
        except httpx.RequestError as e:
            print(f"❌ Connection error to Ollama: {e}")
            raise HTTPException(503, "Embedding service unavailable")

# --- Background Tasks (Heavy Jobs Only) ---
def run_job_pipeline():
    """Runs every 6 hours: Fetch -> Upsert -> Vectorize Jobs -> Geocode"""
    print(f"🚀 [CRON] Starting job update pipeline: {time.ctime()}")
    try:
        # 1. Fetch & Upsert new jobs
        jobs = fetch_new_jobs(None) 
        if jobs:
            upsert_jobs(jobs)
        
        # 2. Vectorize newly added jobs (Async wrapper)
        asyncio.run(enrich_job_vectors())

        # 3. Geocode new jobs (Async wrapper)
        asyncio.run(geocode_new_jobs())
        
        print("✅ [CRON] Pipeline finished successfully")
    except Exception as e:
        print(f"❌ [CRON] Pipeline failed: {e}")

def run_scheduler():
    """Runs in a separate thread to keep the API alive"""
    print("⏰ Scheduler started (Job Pipeline only).")
    
    # Heavy jobs every 6 hours
    schedule.every(6).hours.do(run_job_pipeline)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"⚡ Unified Service Starting... Model: {EMBEDDING_MODEL} ({DIMS} dims)")
    
    # Start Scheduler in a background thread
    scheduler_thread = Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    
    yield

app = FastAPI(lifespan=lifespan)

# --- Models ---
class EmbedRequest(BaseModel):
    text: str

class ProfileUpdateWebhook(BaseModel):
    user_id: str
    cv_text: str

@app.get("/health")
def health():
    return {"status": "ok", "model": EMBEDDING_MODEL, "dims": DIMS}

# 1. Generic Embed Endpoint (For "Wish" search queries from Frontend)
@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")
    return await fetch_embedding(req.text)

# 2. Webhook: Update Profile Vector (Triggered by Next.js on Save)
@app.post("/webhook/update-profile")
async def webhook_update_profile(req: ProfileUpdateWebhook):
    """
    Receives text directly from Next.js, embeds it, and saves to DB.
    No need to download the file again.
    """
    print(f"📥 [WEBHOOK] Generating vector for user: {req.user_id}")
    
    try:
        # Generate Vector
        result = await fetch_embedding(req.cv_text)
        vector = result['vector']

        if not vector:
            raise HTTPException(500, "Failed to generate vector")

        # Update Supabase
        data, count = supabase.table("candidate_profiles").update({
            "profile_vector": vector  # Ensure column name is 'profile_vector'
        }).eq("user_id", req.user_id).execute()

        print(f"✅ [WEBHOOK] Vector updated for {req.user_id}")
        return {"status": "success", "user_id": req.user_id}

    except Exception as e:
        print(f"❌ [WEBHOOK] Failed: {e}")
        raise HTTPException(500, str(e))