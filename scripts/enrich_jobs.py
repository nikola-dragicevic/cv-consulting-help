# scripts/enrich_jobs.py
import os
import sys
import asyncio
import httpx
import json
import math
import re
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

# Keep your existing endpoint for server CPU
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

# CPU safety caps (tune without redeploy by editing env)
MAX_TOTAL_CHARS = int(os.getenv("JOB_EMBED_MAX_CHARS", "2000"))
DESC_CHARS = int(os.getenv("JOB_DESC_CHARS", "900"))  # max desc slice inside the budget
BATCH_LIMIT = int(os.getenv("JOB_ENRICH_BATCH", "50"))

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
    # Safety: prevent empty text
    if not text or len(text) < 10:
        return [0.0] * DIMS

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            OLLAMA_URL,
            json={"model": EMBEDDING_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        emb = resp.json().get("embedding")

        if not emb or len(emb) != DIMS:
            got = len(emb) if emb else 0
            print(f"⚠️ Invalid embedding dims: {got} (expected {DIMS})")
            return [0.0] * DIMS

        return normalize_vector(emb)

def clean_text(s: str) -> str:
    """
    Keep Unicode. Only remove known noise + null bytes.
    """
    if not s:
        return ""

    # Remove null bytes (Postgres killer)
    s = s.replace("\x00", "")

    # Normalize whitespace
    s = s.replace("\r", "\n")
    s = "\n".join(line.strip() for line in s.splitlines())
    s = "\n".join([line for line in s.splitlines() if line])

    # Remove common boilerplate from Arbetsförmedlingen pages
    patterns = [
        r"Öppen för alla.*",
        r"Vi fokuserar på din kompetens.*",
        r"Var ligger arbetsplatsen.*",
        r"Postadress.*",
        r"Ansök.*",
        r"Sök jobbet.*",
    ]
    out_lines = []
    for line in s.splitlines():
        keep = True
        for pat in patterns:
            if re.search(pat, line, flags=re.IGNORECASE):
                keep = False
                break
        if keep:
            out_lines.append(line)

    s = "\n".join(out_lines).strip()

    # Collapse excessive spaces (but keep newlines)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()

def extract_skills_from_snapshot(snap: dict) -> str:
    """Extract explicit skills from Arbetsförmedlingen snapshot structure."""
    if not snap:
        return ""

    must = snap.get("must_have", {}).get("skills", []) or []
    nice = snap.get("nice_to_have", {}).get("skills", []) or []

    must_labels = [x.get("label") for x in must if isinstance(x, dict) and x.get("label")]
    nice_labels = [x.get("label") for x in nice if isinstance(x, dict) and x.get("label")]

    parts = []
    if must_labels:
        parts.append(f"Krav: {', '.join(must_labels)}.")
    if nice_labels:
        parts.append(f"Meriterande: {', '.join(nice_labels)}.")

    return " ".join(parts).strip()

def build_job_embedding_text(row: Dict[str, Any]) -> str:
    """
    CPU-safe, match-quality oriented, prefix-aligned with candidate embeddings.
    IMPORTANT: Use search_document: prefix for nomic-embed-text similarity search.
    """
    snap = row.get("source_snapshot")
    if isinstance(snap, str):
        try:
            snap = json.loads(snap)
        except Exception:
            snap = {}

    headline = (row.get("headline") or "").strip()
    category = (row.get("job_category") or "").strip()
    desc_raw = row.get("description_text") or ""
    desc = clean_text(desc_raw)
    skills_block = extract_skills_from_snapshot(snap)

    # Build structured document text (skills first)
    parts: List[str] = []

    # Prefix for embedding task
    parts.append("search_document:")

    if headline:
        parts.append(f"Jobb: {headline}")
    if category:
        parts.append(f"Kategori: {category}")

    # Highest signal: explicit skills
    if skills_block:
        parts.append("Krav & kompetens:")
        parts.append(skills_block)

    # Description (lower signal, truncated)
    if desc:
        # keep within cap
        desc_slice = desc[:DESC_CHARS]
        parts.append("Beskrivning:")
        parts.append(desc_slice)

    final_text = "\n".join(parts).strip()

    # Final hard cap for CPU stability
    if len(final_text) > MAX_TOTAL_CHARS:
        final_text = final_text[:MAX_TOTAL_CHARS]

    return final_text

async def enrich_job_vectors():
    print(f"📦 Job enrichment (CPU-safe). Model: {EMBEDDING_MODEL} | MAX_CHARS={MAX_TOTAL_CHARS} | DESC_CHARS={DESC_CHARS}")

    while True:
        response = (
            supabase.table("job_ads")
            .select("*")
            .is_("embedding", "null")
            .limit(BATCH_LIMIT)
            .execute()
        )

        jobs = response.data or []
        if not jobs:
            print("✅ Inga fler jobb att vektorisera.")
            break

        print(f"🔄 Bearbetar {len(jobs)} jobb...")

        for row in jobs:
            job_id = row.get("id")
            try:
                text = build_job_embedding_text(row)
                vector = await get_local_embedding(text)

                if vector == [0.0] * DIMS:
                    print(f"   ⚠️ Tom/ogiltig vektor för {job_id}, hoppar över.")
                    continue

                supabase.table("job_ads").update({
                    "embedding": vector,
                    "embedding_text": text
                }).eq("id", job_id).execute()

                hl = (row.get("headline") or "")[:40]
                print(f"   ✅ Klar: {hl}... ({len(text)} chars)")

            except Exception as e:
                print(f"   ❌ Fel på {job_id}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())
