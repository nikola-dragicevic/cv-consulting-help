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

# ✅ FIX: Import the correct new function
from scripts.generate_candidate_vector import build_candidate_vector

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = 768

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helper: Normalization ---
def normalize_vector(vector: list[float]) -> list[float]:
    if not vector:
        return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * len(vector)
    return [x / magnitude for x in vector]

# --- Helper: Simple Ollama Call (For /embed endpoint only) ---
async def fetch_simple_embedding(text: str):
    """Legacy helper for the simple /embed endpoint"""
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
                return {"vector": None}

            return {"vector": normalize_vector(embedding)}

        except httpx.RequestError as e:
            print(f"❌ Connection error to Ollama: {e}")
            raise HTTPException(503, "Embedding service unavailable")

# --- Background Pipeline ---
def run_daily_pipeline():
    print(f"🚀 [CRON] Starting daily job pipeline: {time.ctime()}")
    try:
        run_job_update()
        asyncio.run(enrich_job_vectors())
        asyncio.run(geocode_new_jobs())
        print("✅ [CRON] Pipeline finished successfully")
    except Exception as e:
        print(f"❌ [CRON] Pipeline failed: {e}")

def run_scheduler():
    print("⏰ Scheduler started. Pipeline set for 04:00 daily.")
    schedule.every().day.at("04:00").do(run_daily_pipeline)
    while True:
        schedule.run_pending()
        time.sleep(10)

# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"⚡ Unified Service Starting... Model: {EMBEDDING_MODEL}")
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
    return {"status": "ok", "model": EMBEDDING_MODEL}

@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")
    text = req.text[:1500] 
    return await fetch_simple_embedding(text)

@app.post("/webhook/update-profile")
async def webhook_update_profile(req: ProfileUpdateWebhook):
    print(f"📥 [WEBHOOK] Generating vector for user: {req.user_id}")
    try:
        # 1. Fetch Profile
        profile_res = (
            supabase.table("candidate_profiles")
            .select("*")
            .eq("user_id", req.user_id)
            .single()
            .execute()
        )

        if not profile_res.data:
            raise HTTPException(404, "Profile not found")

        profile = profile_res.data
        cv_text = req.cv_text
        has_picture: bool = False

        # 2. Download CV if text is missing
        if (not cv_text or not cv_text.strip()) and profile.get("cv_bucket_path"):
            path = profile["cv_bucket_path"]
            print(f"📥 [WEBHOOK] CV text empty, downloading: {path}")
            try:
                from scripts.parse_cv_pdf import (
                    extract_text_from_pdf,
                    extract_text_from_docx,
                    summarize_cv_text,
                )

                data = supabase.storage.from_("cvs").download(path)
                
                is_pdf = path.lower().endswith(".pdf")
                is_docx = path.lower().endswith(".docx")
                local_ext = ".pdf" if is_pdf else (".docx" if is_docx else ".txt")
                local_path = f"/tmp/temp_{req.user_id}{local_ext}"

                with open(local_path, "wb") as f:
                    f.write(data)

                # Parse
                if is_pdf:
                    raw, has_img_bool = extract_text_from_pdf(local_path)
                    has_picture = bool(has_img_bool)
                    cv_text = summarize_cv_text(raw)
                elif is_docx:
                    raw = extract_text_from_docx(local_path)
                    cv_text = summarize_cv_text(raw)
                    has_picture = False
                else:
                    with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)
                    has_picture = False

                if os.path.exists(local_path):
                    os.remove(local_path)

                print(f"✅ Extracted {len(cv_text) if cv_text else 0} chars.")

            except Exception as e:
                print(f"⚠️ [WEBHOOK] Storage download failed: {e}")
                raise HTTPException(500, f"Failed to download CV: {str(e)}")

        # 3. Handle Empty CV
        if not cv_text or not cv_text.strip():
            supabase.table("candidate_profiles").update({
                "has_picture": has_picture
            }).eq("user_id", req.user_id).execute()
            
            print("❌ [WEBHOOK] No text available.")
            raise HTTPException(400, "No CV text available")

        # 4. Generate Vector (Chunked)
        print(f"🎯 [WEBHOOK] Generating Chunked Vector...")
        
        # ✅ FIX: Calls the new function that handles chunking internally
        vector = await build_candidate_vector(profile, cv_text)

        if not vector:
            print("❌ [WEBHOOK] Vector generation failed (too short or empty?)")
            raise HTTPException(500, "Failed to generate vector")

        # Create a preview string for debugging
        debug_preview = (cv_text or "").replace("\x00", "")[:2000]
        debug_text = f"search_document: Candidate: {profile.get('full_name')}\nCV Preview:\n{debug_preview}"

        # 5. Save to DB
        supabase.table("candidate_profiles").update({
            "profile_vector": vector,
            "candidate_text_vector": debug_text,
            "has_picture": has_picture
        }).eq("user_id", req.user_id).execute()

        print(f"✅ [WEBHOOK] Success for {req.user_id}")
        return {"status": "success", "user_id": req.user_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [WEBHOOK] Critical Error: {e}")
        raise HTTPException(500, str(e))