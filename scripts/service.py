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
from scripts.sync_active_jobs import clean_stale_jobs  # removes stale jobs
from scripts.generate_candidate_vector import build_candidate_vector  # chunking inside

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# /embed endpoint only (simple legacy helper)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helper: Normalization (only used by /embed endpoint) ---
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
                json={"model": EMBEDDING_MODEL, "prompt": text},
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
        # 1) Remove stale jobs first
        clean_stale_jobs()

        # 2) Fetch new/changed jobs
        run_job_update()

        # 3) Enrich jobs missing embeddings (CPU-safe script)
        asyncio.run(enrich_job_vectors())

        # 4) Geocode missing lat/lon
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
    return {"status": "ok", "model": EMBEDDING_MODEL, "dims": DIMS}

@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")

    # Keep /embed small and stable
    text = req.text[:1500]
    return await fetch_simple_embedding(text)

async def generate_persona_vectors(profile: dict) -> dict:
    """
    Generate vectors for persona fields when entry_mode is 'manual_entry'.
    Returns dict with persona vector fields to update.
    """
    patch = {}

    # Generate current persona vector
    if profile.get("persona_current_text"):
        vec = await build_candidate_vector(profile, profile["persona_current_text"])
        if vec:
            patch["persona_current_vector"] = vec
            print(f"✅ persona_current_vector generated ({len(vec)} dims)")

    # Generate target persona vector
    if profile.get("persona_target_text"):
        vec = await build_candidate_vector(profile, profile["persona_target_text"])
        if vec:
            patch["persona_target_vector"] = vec
            print(f"✅ persona_target_vector generated ({len(vec)} dims)")

    # Generate past persona vectors (1-3)
    for i in range(1, 4):
        text_field = f"persona_past_{i}_text"
        vec_field = f"persona_past_{i}_vector"
        if profile.get(text_field):
            vec = await build_candidate_vector(profile, profile[text_field])
            if vec:
                patch[vec_field] = vec
                print(f"✅ {vec_field} generated ({len(vec)} dims)")

    return patch

@app.post("/webhook/update-profile")
async def webhook_update_profile(req: ProfileUpdateWebhook):
    print(f"📥 [WEBHOOK] Generating candidate vector for user: {req.user_id}")

    has_picture: bool = False
    cv_text = req.cv_text

    try:
        # 1) Fetch profile
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
        entry_mode = profile.get("entry_mode", "cv_upload")

        # 2) If cv_text missing: download and parse from storage
        if (not cv_text or not cv_text.strip()) and profile.get("cv_bucket_path"):
            path = profile["cv_bucket_path"]
            print(f"📥 [WEBHOOK] CV text empty, downloading: {path}")

            local_path = None
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

                print(f"✅ [WEBHOOK] Extracted {len(cv_text) if cv_text else 0} chars. has_picture={has_picture}")

            except Exception as e:
                print(f"⚠️ [WEBHOOK] Storage download/parse failed: {e}")
                raise HTTPException(500, f"Failed to download CV: {str(e)}")

            finally:
                # Always clean temp file if it exists
                try:
                    if local_path and os.path.exists(local_path):
                        os.remove(local_path)
                except Exception:
                    pass

        # 3) Handle empty CV
        if not cv_text or not cv_text.strip():
            # Still store has_picture info if we detected it
            try:
                supabase.table("candidate_profiles").update({
                    "has_picture": has_picture
                }).eq("user_id", req.user_id).execute()
            except Exception as e:
                print(f"⚠️ [WEBHOOK] Failed saving has_picture: {e}")

            print("❌ [WEBHOOK] No CV text available")
            raise HTTPException(400, "No CV text available")

        # 4) Generate vectors based on entry mode
        update_data = {"has_picture": has_picture}

        if entry_mode == "manual_entry":
            print("🎯 [WEBHOOK] Manual entry mode - generating persona vectors...")

            # Generate all persona vectors
            persona_vectors = await generate_persona_vectors(profile)
            update_data.update(persona_vectors)

            # Also generate a combined profile_vector for backward compatibility
            # Combine current + target text for the main profile vector
            combined_text = []
            if profile.get("persona_current_text"):
                combined_text.append(f"Current: {profile['persona_current_text']}")
            if profile.get("persona_target_text"):
                combined_text.append(f"Target: {profile['persona_target_text']}")
            if profile.get("skills_text"):
                combined_text.append(f"Skills: {profile['skills_text']}")
            if profile.get("education_certifications_text"):
                combined_text.append(f"Education: {profile['education_certifications_text']}")

            if combined_text:
                combined = "\n".join(combined_text)
                vector = await build_candidate_vector(profile, combined)
                if vector:
                    update_data["profile_vector"] = vector
                    print(f"✅ profile_vector (combined) generated ({len(vector)} dims)")

                # Store debug text
                debug_preview = combined[:2000]
                debug_text = (
                    f"search_document:\n"
                    f"Candidate: {profile.get('full_name')}\n"
                    f"Manual Entry Preview:\n{debug_preview}"
                )
                update_data["candidate_text_vector"] = debug_text

            print(f"✅ [WEBHOOK] Generated {len(persona_vectors)} persona vectors")

        else:
            # CV upload mode - original behavior
            print("🎯 [WEBHOOK] CV upload mode - generating chunked candidate vector...")
            vector = await build_candidate_vector(profile, cv_text)

            if not vector:
                # still store has_picture
                supabase.table("candidate_profiles").update({
                    "has_picture": has_picture
                }).eq("user_id", req.user_id).execute()

                raise HTTPException(500, "Failed to generate vector")

            # 5) Save to DB (store debug preview, not necessarily exact embed input)
            debug_preview = (cv_text or "").replace("\x00", "")[:2000]
            debug_text = (
                f"search_document:\n"
                f"Candidate: {profile.get('full_name')}\n"
                f"CV Preview:\n{debug_preview}"
            )

            update_data["profile_vector"] = vector
            update_data["candidate_text_vector"] = debug_text

        # Save all updates to DB
        supabase.table("candidate_profiles").update(update_data).eq("user_id", req.user_id).execute()

        print(f"✅ [WEBHOOK] Success for {req.user_id}")
        return {"status": "success", "user_id": req.user_id, "entry_mode": entry_mode}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [WEBHOOK] Critical Error: {e}")

        # attempt to store has_picture even on critical error
        try:
            supabase.table("candidate_profiles").update({
                "has_picture": has_picture
            }).eq("user_id", req.user_id).execute()
        except Exception:
            pass

        raise HTTPException(500, str(e))
