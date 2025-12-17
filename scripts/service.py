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
# (Ensure these scripts are present and cleaned up as per step 3 below)
from scripts.update_jobs import fetch_new_jobs, upsert_jobs
from scripts.enrich_jobs import enrich_job_vectors
from scripts.geocode_jobs import geocode_new_jobs
from scripts.generate_candidate_vector import enrich_candidates

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
# Use the internal docker hostname 'ollama' by default
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

# --- Background Tasks ---

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

def run_quick_tasks():
    """Runs frequently (e.g. every 10s): Vectorize Candidates"""
    # This handles the "User saved profile" scenario immediately
    try:
        asyncio.run(enrich_candidates())
    except Exception as e:
        print(f"❌ [QUICK] Candidate enrichment failed: {e}")

def run_scheduler():
    """Runs in a separate thread to keep the API alive"""
    print("⏰ Scheduler started.")
    
    # Heavy jobs every 6 hours
    schedule.every(6).hours.do(run_job_pipeline)
    
    # Quick checks every 10 seconds (for new CVs)
    schedule.every(10).seconds.do(run_quick_tasks)
    
    # Run once on startup to catch up
    # Thread(target=run_job_pipeline).start() 

    while True:
        schedule.run_pending()
        time.sleep(1)

# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup event
    print(f"⚡ Unified Service Starting... Model: {EMBEDDING_MODEL} ({DIMS} dims)")
    
    # Start Scheduler in a background thread
    scheduler_thread = Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    
    yield
    # Shutdown event

app = FastAPI(lifespan=lifespan)

class EmbedRequest(BaseModel):
    text: str

@app.get("/health")
def health():
    return {"status": "ok", "model": EMBEDDING_MODEL, "dims": DIMS}

@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    """
    Endpoint for Next.js to request embeddings.
    Strictly enforces 1024 dimensions and normalization.
    """
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                OLLAMA_URL,
                json={"model": EMBEDDING_MODEL, "prompt": req.text}
            )
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding")
            
            if not embedding or len(embedding) != DIMS:
                error_msg = f"Ollama returned invalid dims. Expected {DIMS}, got {len(embedding) if embedding else 0}"
                print(f"❌ {error_msg}")
                raise HTTPException(500, error_msg)
                
            return {"vector": normalize_vector(embedding)}
            
        except httpx.RequestError as e:
            print(f"❌ Connection error to Ollama: {e}")
            raise HTTPException(503, "Embedding service unavailable")
        except Exception as e:
            print(f"❌ Embedding Error: {e}")
            raise HTTPException(500, str(e))
