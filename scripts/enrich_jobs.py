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
DIMS = 768  # nomic-embed-text uses 768 dimensions

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helpers ---

def normalize_vector(vector: List[float]) -> List[float]:
    if not vector: return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0: return [0.0] * len(vector)
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> List[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            OLLAMA_URL,
            json={"model": EMBEDDING_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        emb = resp.json().get("embedding")
        if not emb or len(emb) != DIMS:
            raise ValueError(f"Invalid dims: {len(emb)}")
        return normalize_vector(emb)

def clean_text(s: str) -> str:
    if not s: return ""
    # Ta bort vanliga footer-fraser som förstör matchningen
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
    
    # Plocka ut label från listan av objekt
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

    # 2. Bygg datan
    headline = row.get("headline") or ""
    category = row.get("job_category") or ""

    # 3. Hämta de viktigaste nyckelorden (Skills)
    skills_block = extract_skills_from_snapshot(snap)

    # 4. Hämta beskrivning
    desc = row.get("description_text") or ""
    cleaned_desc = clean_text(desc)

    # NEW APPROACH: Use semantic tags + repetition like we do for candidates
    # Research shows: LLMs sensitive to formatting (76 point difference!)
    # Prioritize: Skills > Title > Category > Description

    parts = []

    # HIGHEST PRIORITY: Skills (repeated 2x for emphasis)
    if skills_block:
        parts.append("=== KRAV OCH KOMPETENSER (VIKTIGAST) ===")
        parts.append(skills_block)
        parts.append("\n=== NYCKELKOMPETENSER (REPETITION FÖR VIKT) ===")
        parts.append(skills_block)

    # HIGH PRIORITY: Title + Category
    parts.append(f"\n=== JOBBTITEL ===")
    parts.append(headline)
    if category:
        parts.append(f"\n=== KATEGORI ===")
        parts.append(category)

    # MEDIUM PRIORITY: Description (limited to first 1200 chars to fit in context)
    # Focus on requirements section which is usually at the beginning
    if cleaned_desc:
        parts.append(f"\n=== BESKRIVNING ===")
        parts.append(cleaned_desc[:1200])

    # Target: ~2500 chars (fits easily in nomic-embed-text's 8192 token context)
    return "\n".join(parts)

async def enrich_job_vectors():
    print(f"📦 Enriching Jobs... Model: {EMBEDDING_MODEL}")

    while True:
        # Hämta jobb som saknar embedding
        response = (
            supabase.table("job_ads")
            .select("*") # Hämta allt så vi får source_snapshot
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

                # Spara BÅDE vektor och texten vi använde (för debugging)
                supabase.table("job_ads").update({
                    "embedding": vector,
                    "embedding_text": text 
                }).eq("id", job_id).execute()

                print(f"   ✅ Klar: {row.get('headline')} (Text len: {len(text)})")

            except Exception as e:
                print(f"   ❌ Fel på {job_id}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())