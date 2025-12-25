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

# Import logic from other scripts
from scripts.update_jobs import run_job_update
from scripts.enrich_jobs import enrich_job_vectors
from scripts.geocode_jobs import geocode_new_jobs
from scripts.generate_candidate_vector import build_prioritized_prompt

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = 768  # nomic-embed-text uses 768 dimensions

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

# --- Background Pipeline ---
def run_daily_pipeline():
    """
    Runs daily at 04:00:
    1. Fetch new jobs & Delete expired jobs (update_jobs.py)
    2. Vectorize new jobs (enrich_jobs.py)
    3. Geocode jobs missing coordinates (geocode_jobs.py)
    """
    print(f"🚀 [CRON] Starting daily job pipeline: {time.ctime()}")
    try:
        # Step 1: Update & Cleanup
        run_job_update()
        
        # Step 2: Vectorize newly added jobs
        asyncio.run(enrich_job_vectors())

        # Step 3: Geocode new jobs (filling gaps in lat/lon)
        asyncio.run(geocode_new_jobs())
        
        print("✅ [CRON] Pipeline finished successfully")
    except Exception as e:
        print(f"❌ [CRON] Pipeline failed: {e}")

def run_scheduler():
    """Runs in a separate thread to keep the API alive"""
    print("⏰ Scheduler started. Pipeline set for 04:00 daily.")
    
    # Schedule the job for 4:00 AM every day
    schedule.every().day.at("04:00").do(run_daily_pipeline)
    
    # Also run once on startup (optional, for testing)
    # run_daily_pipeline()

    while True:
        schedule.run_pending()
        time.sleep(10)

# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"⚡ Unified Service Starting... Model: {EMBEDDING_MODEL} ({DIMS} dims)")
    
    # Start Scheduler in a background thread
    scheduler_thread = Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    
    yield

app = FastAPI(lifespan=lifespan)

class EmbedRequest(BaseModel):
    text: str

class ProfileUpdateWebhook(BaseModel):
    user_id: str
    cv_text: str

@app.get("/health")
def health():
    return {"status": "ok", "model": EMBEDDING_MODEL, "dims": DIMS}

@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")

    # ✅ Truncate to safe length for CPU batch size
    text = req.text
    MAX_CHARS = 1500
    if len(text) > MAX_CHARS:
        print(f"⚠️  [EMBED] Truncating text from {len(text)} to {MAX_CHARS} chars")
        text = text[:MAX_CHARS]

    return await fetch_embedding(text)

@app.post("/webhook/update-profile")
async def webhook_update_profile(req: ProfileUpdateWebhook):
    print(f"📥 [WEBHOOK] Generating vector for user: {req.user_id}")
    try:
        # Fetch the full profile
        profile_res = supabase.table("candidate_profiles").select("*").eq("user_id", req.user_id).single().execute()

        if not profile_res.data:
            raise HTTPException(404, "Profile not found")

        profile = profile_res.data

        # If cv_text is empty, download from storage
        cv_text = req.cv_text
        if not cv_text and profile.get("cv_bucket_path"):
            print(f"📥 [WEBHOOK] CV text empty, downloading from storage: {profile['cv_bucket_path']}")
            try:
                import os
                from scripts.parse_cv_pdf import extract_text_from_pdf, summarize_cv_text

                # Download CV from storage
                data = supabase.storage.from_("cvs").download(profile['cv_bucket_path'])

                # Determine file type
                is_pdf = profile['cv_bucket_path'].lower().endswith('.pdf')
                local_ext = '.pdf' if is_pdf else '.txt'
                local_path = f"/tmp/temp_{req.user_id}{local_ext}"

                # Write to temp file
                with open(local_path, 'wb') as f:
                    f.write(data)

                # Extract text
                if is_pdf:
                    raw = extract_text_from_pdf(local_path)
                    cv_text = summarize_cv_text(raw)
                else:
                    with open(local_path, 'r', encoding='utf-8', errors='ignore') as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)

                # Clean up
                if os.path.exists(local_path):
                    os.remove(local_path)

                print(f"✅ [WEBHOOK] Extracted {len(cv_text)} chars from storage")

            except Exception as e:
                print(f"⚠️  [WEBHOOK] Failed to download CV from storage: {e}")
                raise HTTPException(500, f"Failed to download CV: {str(e)}")

        if not cv_text:
            raise HTTPException(400, "No CV text available")

        # Use improved prioritization logic (Skills > Education > Experience)
        prioritized_prompt = build_prioritized_prompt(profile, cv_text)

        # ✅ CRITICAL: Truncate to safe length for CPU batch size (512)
        # nomic-embed-text with batch_size 512 can handle ~1500 chars (~300 tokens) safely on CPU
        MAX_CHARS = 1500
        if len(prioritized_prompt) > MAX_CHARS:
            print(f"⚠️ [WEBHOOK] Truncating prompt from {len(prioritized_prompt)} to {MAX_CHARS} chars")
            prioritized_prompt = prioritized_prompt[:MAX_CHARS]

        print(f"🎯 [WEBHOOK] Using prioritized prompt ({len(prioritized_prompt)} chars)")

        result = await fetch_embedding(prioritized_prompt)
        vector = result['vector']
        if not vector:
            raise HTTPException(500, "Failed to generate vector")

        # Update both vector and the text used for debugging
        supabase.table("candidate_profiles").update({
            "profile_vector": vector,
            "candidate_text_vector": prioritized_prompt
        }).eq("user_id", req.user_id).execute()

        print(f"✅ [WEBHOOK] Vector updated for {req.user_id}")
        return {"status": "success", "user_id": req.user_id}

    except Exception as e:
        print(f"❌ [WEBHOOK] Failed: {e}")
        raise HTTPException(500, str(e))