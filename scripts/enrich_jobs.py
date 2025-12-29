# scripts/enrich_jobs.py
import os
import sys
import asyncio
import httpx
import json
import math
import re
import time
from typing import Any, Dict, List
from supabase import create_client, Client
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

# ✅ LOWER BATCH SIZE to prevent Cloudflare 502/504 Timeouts
BATCH_LIMIT = 10
MAX_RETRIES = 3

# Text caps for CPU safety
MAX_TOTAL_CHARS = int(os.getenv("JOB_EMBED_MAX_CHARS", "2000"))
DESC_CHARS = int(os.getenv("JOB_DESC_CHARS", "900"))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helpers ---

def normalize_vector(vector: List[float]) -> List[float]:
    if not vector:
        return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * len(vector)
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> List[float]:
    if not text or len(text) < 10:
        return [0.0] * DIMS

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                OLLAMA_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text},
            )
            resp.raise_for_status()
            emb = resp.json().get("embedding")
            if not emb or len(emb) != DIMS:
                return [0.0] * DIMS
            return normalize_vector(emb)
        except Exception as e:
            print(f"   ⚠️ Embedding failed: {e}")
            return [0.0] * DIMS

def clean_text(s: str) -> str:
    """
    Keep Unicode. Remove null bytes + common boilerplate + normalize whitespace.
    """
    if not s:
        return ""

    s = s.replace("\x00", "")  # Postgres killer
    s = s.replace("\r", "\n")

    patterns = [
        r"Öppen för alla.*",
        r"Vi fokuserar på din kompetens.*",
        r"Var ligger arbetsplatsen.*",
        r"Postadress.*",
        r"Ansök.*",
        r"Sök jobbet.*",
        r"Arbetsgivaren har tagit bort annonsen.*",
    ]

    # Strip lines, remove empties, drop boilerplate lines
    out_lines = []
    for line in s.splitlines():
        line = line.strip()
        if not line:
            continue
        if any(re.search(p, line, flags=re.I) for p in patterns):
            continue
        out_lines.append(line)

    s = "\n".join(out_lines).strip()

    # Collapse repeated spaces (keep newlines)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()

def extract_skills(snap: dict) -> str:
    """
    ✅ FIX: Return "" if no skills exist (avoid 'Krav: . Meriterande: .')
    """
    if not snap:
        return ""

    must = [
        x.get("label")
        for x in (snap.get("must_have", {}).get("skills", []) or [])
        if isinstance(x, dict) and x.get("label")
    ]
    nice = [
        x.get("label")
        for x in (snap.get("nice_to_have", {}).get("skills", []) or [])
        if isinstance(x, dict) and x.get("label")
    ]

    parts = []
    if must:
        parts.append(f"Krav: {', '.join(must)}.")
    if nice:
        parts.append(f"Meriterande: {', '.join(nice)}.")
    return " ".join(parts).strip()

def build_job_text(row: Dict[str, Any]) -> str:
    snap = row.get("source_snapshot") or {}
    if isinstance(snap, str):
        try:
            snap = json.loads(snap)
        except Exception:
            snap = {}

    headline = (row.get("headline") or "").strip()
    skills = extract_skills(snap)

    desc_raw = row.get("description_text") or ""
    desc = clean_text(desc_raw)
    if desc:
        desc = desc[:DESC_CHARS]

    parts: List[str] = [
        "search_document:",
        f"Jobb: {headline}" if headline else "Jobb:",
    ]

    if skills:
        parts.append("Kompetens:")
        parts.append(skills)

    if desc:
        parts.append("Beskrivning:")
        parts.append(desc)

    final_text = "\n".join(parts).strip()

    # CPU safety hard cap
    if len(final_text) > MAX_TOTAL_CHARS:
        final_text = final_text[:MAX_TOTAL_CHARS]

    return final_text

async def enrich_job_vectors():
    print(f"📦 Robust Job Enrichment. Model: {EMBEDDING_MODEL} | Batch: {BATCH_LIMIT} | MAX_CHARS={MAX_TOTAL_CHARS}")

    while True:
        # ✅ RETRY LOGIC for Database Connection
        jobs = []
        for attempt in range(MAX_RETRIES):
            try:
                response = (
                    supabase.table("job_ads")
                    .select("*")
                    .is_("embedding", "null")
                    .limit(BATCH_LIMIT)
                    .execute()
                )
                jobs = response.data or []
                break  # success
            except Exception as e:
                print(f"   ⚠️ DB Error (Attempt {attempt+1}/{MAX_RETRIES}): {e}")
                time.sleep(5)

        if not jobs:
            print("✅ Inga fler jobb att vektorisera.")
            break

        print(f"🔄 Processing batch of {len(jobs)}...")

        for row in jobs:
            job_id = row.get("id")
            try:
                text = build_job_text(row)
                vector = await get_local_embedding(text)

                if vector == [0.0] * DIMS:
                    print(f"   ⚠️ Skipping {job_id} (Vector gen failed)")
                    continue

                # ✅ RETRY LOGIC for Save
                for save_attempt in range(MAX_RETRIES):
                    try:
                        supabase.table("job_ads").update({
                            "embedding": vector,
                            "embedding_text": text
                        }).eq("id", job_id).execute()
                        print(f"   ✅ Saved: {(row.get('headline') or '')[:30]}...")
                        break
                    except Exception as e:
                        print(f"      ⚠️ Save failed ({save_attempt+1}/{MAX_RETRIES}): {e}")
                        time.sleep(2)

            except Exception as e:
                print(f"   ❌ Fatal error on {job_id}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())
