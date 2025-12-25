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
        run_job_update()
        asyncio.run(enrich_job_vectors())
        asyncio.run(geocode_new_jobs())
        print("✅ [CRON] Pipeline finished successfully")
    except Exception as e:
        print(f"❌ [CRON] Pipeline failed: {e}")

def run_scheduler():
    """Runs in a separate thread to keep the API alive"""
    print("⏰ Scheduler started. Pipeline set for 04:00 daily.")
    schedule.every().day.at("04:00").do(run_daily_pipeline)

    while True:
        schedule.run_pending()
        time.sleep(10)

# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"⚡ Unified Service Starting... Model: {EMBEDDING_MODEL} ({DIMS} dims)")
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
        has_picture: bool = False  # boolean default

        # If cv_text is empty, download from storage
        if (not cv_text or not cv_text.strip()) and profile.get("cv_bucket_path"):
            path = profile["cv_bucket_path"]
            print(f"📥 [WEBHOOK] CV text empty, downloading from storage: {path}")
            try:
                # ✅ Import docx parser too
                from scripts.parse_cv_pdf import (
                    extract_text_from_pdf,
                    extract_text_from_docx,
                    summarize_cv_text,
                )

                # Download CV from storage
                data = supabase.storage.from_("cvs").download(path)

                # ✅ Determine file type correctly
                is_pdf = path.lower().endswith(".pdf")
                is_docx = path.lower().endswith(".docx")

                if is_pdf:
                    local_ext = ".pdf"
                elif is_docx:
                    local_ext = ".docx"
                else:
                    local_ext = ".txt"

                local_path = f"/tmp/temp_{req.user_id}{local_ext}"

                # Write to temp file
                with open(local_path, "wb") as f:
                    f.write(data)

                # ✅ Use correct parser
                if is_pdf:
                    raw, has_img_bool = extract_text_from_pdf(local_path)
                    has_picture = bool(has_img_bool)
                    cv_text = summarize_cv_text(raw)

                elif is_docx:
                    raw = extract_text_from_docx(local_path)
                    cv_text = summarize_cv_text(raw)
                    has_picture = False  # docx images not detected (by design)

                else:
                    with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)
                    has_picture = False

                # Clean up
                if os.path.exists(local_path):
                    os.remove(local_path)

                print(
                    f"✅ [WEBHOOK] Extracted {len(cv_text) if cv_text else 0} chars. "
                    f"Has Picture: {has_picture}"
                )

            except Exception as e:
                print(f"⚠️  [WEBHOOK] Failed to download CV from storage: {e}")
                raise HTTPException(500, f"Failed to download CV: {str(e)}")

        # If no text exists, still save has_picture and exit gracefully
        if not cv_text or not cv_text.strip():
            try:
                supabase.table("candidate_profiles").update({
                    "has_picture": has_picture
                }).eq("user_id", req.user_id).execute()
            except Exception as db_e:
                print(f"⚠️  [WEBHOOK] Failed to update has_picture: {db_e}")

            print("❌ [WEBHOOK] No text found. File might be image-only PDF or empty.")
            raise HTTPException(400, "No CV text available (File might be an image-only PDF)")

        prioritized_prompt = build_prioritized_prompt(profile, cv_text)

        MAX_CHARS = 1500
        if len(prioritized_prompt) > MAX_CHARS:
            print(f"⚠️ [WEBHOOK] Truncating prompt from {len(prioritized_prompt)} to {MAX_CHARS} chars")
            prioritized_prompt = prioritized_prompt[:MAX_CHARS]

        print(f"🎯 [WEBHOOK] Using prioritized prompt ({len(prioritized_prompt)} chars)")

        result = await fetch_embedding(prioritized_prompt)
        vector = result.get("vector")
        if not vector:
            raise HTTPException(500, "Failed to generate vector")

        supabase.table("candidate_profiles").update({
            "profile_vector": vector,
            "candidate_text_vector": prioritized_prompt,
            "has_picture": has_picture
        }).eq("user_id", req.user_id).execute()

        print(f"✅ [WEBHOOK] Vector updated for {req.user_id}")
        return {"status": "success", "user_id": req.user_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [WEBHOOK] Failed: {e}")
        raise HTTPException(500, str(e))
