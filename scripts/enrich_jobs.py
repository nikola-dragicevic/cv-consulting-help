# scripts/enrich_jobs.py
import os
import sys
import asyncio
import httpx
import json
import math
import re
from typing import Any, Dict, List, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = 768

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helpers ---

def normalize_vector(vector: List[float]) -> List[float]:
    if not vector: return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0: return [0.0] * len(vector)
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> List[float]:
    # ✅ SAFETY: Prevent empty or too short text from hitting Ollama
    if not text or len(text) < 5: return [0.0] * DIMS
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                OLLAMA_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text},
            )
            resp.raise_for_status()
            emb = resp.json().get("embedding")
            if not emb or len(emb) != DIMS:
                # Log warning but return zero vector instead of crashing
                print(f"⚠️ Invalid dims: {len(emb) if emb else 0}")
                return [0.0] * DIMS
            return normalize_vector(emb)
        except Exception as e:
            print(f"⚠️ Ollama Error: {e}")
            raise e

def clean_text(s: str) -> str:
    if not s: return ""
    # Remove footer phrases
    patterns = [
        r"Öppen för alla.*", r"Vi fokuserar på din kompetens.*",
        r"Var ligger arbetsplatsen.*", r"Postadress.*"
    ]
    s = s.replace("\r", " ").replace("\n", " ")
    for pat in patterns:
        s = re.sub(pat, "", s, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", s).strip()

def extract_skills_from_snapshot(snap: dict) -> str:
    """Extraherar explicita skills från Arbetsförmedlingens struktur"""
    if not snap: return ""
    
    must = snap.get("must_have", {}).get("skills", [])
    nice = snap.get("nice_to_have", {}).get("skills", [])
    
    must_labels = [s.get("label") for s in must if s.get("label")]
    nice_labels = [s.get("label") for s in nice if s.get("label")]
    
    skill_text = ""
    if must_labels:
        skill_text += f"Krav: {', '.join(must_labels)}. "
    if nice_labels:
        skill_text += f"Meriterande: {', '.join(nice_labels)}."
        
    return skill_text

def build_job_embedding_text(row: Dict[str, Any]) -> str:
    # 1. Hämta rådata (Snapshot)
    snap = row.get("source_snapshot")
    if isinstance(snap, str):
        try: snap = json.loads(snap)
        except: snap = {}

    # 2. Data points
    headline = row.get("headline") or ""
    category = row.get("job_category") or ""
    skills_block = extract_skills_from_snapshot(snap)
    desc = row.get("description_text") or ""
    
    # 3. Clean Description
    cleaned_desc = clean_text(desc)
    # Sanitization for CPU stability (remove weird chars)
    cleaned_desc = cleaned_desc.encode("ascii", errors="ignore").decode()
    cleaned_desc = cleaned_desc.replace('\x00', '')

    parts = []

    # HIGHEST PRIORITY: Skills (repeated 2x for emphasis)
    if skills_block:
        parts.append("=== KRAV (VIKTIGAST) ===")
        parts.append(skills_block)
        parts.append("=== KOMPETENS (VIKTIGAST) ===") # Shortened header
        parts.append(skills_block)

    # HIGH PRIORITY: Title + Category
    parts.append(f"Jobb: {headline}")
    if category:
        parts.append(f"Kategori: {category}")

    # MEDIUM PRIORITY: Description (Truncated)
    # We reduce this to 800 to ensure we have room for the important skills above
    if cleaned_desc:
        parts.append(f"Beskrivning: {cleaned_desc[:800]}")

    final_text = "\n".join(parts)

    # ✅ FINAL SAFETY NET: Hard truncate to 2000 chars for CPU batch stability
    if len(final_text) > 2000:
        final_text = final_text[:2000]

    return final_text

async def enrich_job_vectors():
    print(f"📦 Safer Job Enrichment... Max 2000 chars. Model: {EMBEDDING_MODEL}")

    while True:
        # Hämta jobb som saknar embedding
        response = (
            supabase.table("job_ads")
            .select("*")
            .is_("embedding", "null")
            .limit(50)
            .execute()
        )

        jobs = response.data
        if not jobs:
            print("✅ Inga fler jobb att vektorisera.")
            break

        print(f"🔄 Bearbetar {len(jobs)} jobb...")

        for row in jobs:
            job_id = row["id"]
            try:
                # Skapa texten
                text = build_job_embedding_text(row)
                
                # Skapa vektor
                vector = await get_local_embedding(text)
                
                if vector == [0.0] * DIMS:
                    print(f"   ⚠️ Tom vektor genererad för {job_id}, hoppar över.")
                    continue

                # Spara
                supabase.table("job_ads").update({
                    "embedding": vector,
                    "embedding_text": text 
                }).eq("id", job_id).execute()

                print(f"   ✅ Klar: {row.get('headline')[:30]}... ({len(text)} chars)")

            except Exception as e:
                print(f"   ❌ Fel på {job_id}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())