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
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2")
DIMS = 1024

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ----------------------------
# Embedding helpers
# ----------------------------
def normalize_vector(vector: List[float]) -> List[float]:
    if not vector:
        return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * len(vector)
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> List[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            OLLAMA_URL,
            json={"model": EMBEDDING_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        data = resp.json()
        emb = data.get("embedding")

        if not emb or len(emb) != DIMS:
            raise ValueError(f"Invalid dimensions: {len(emb) if emb else 'None'}. Expected {DIMS}.")

        return normalize_vector(emb)

# ----------------------------
# Text building (NO keyword ranking)
# ----------------------------
_BOILERPLATE_PATTERNS = [
    r"Öppen för alla.*",                     # common footer
    r"Vi fokuserar på din kompetens.*",
    r"Urval och intervjuer sker löpande.*",
    r"Skicka in din ansökan.*",
    r"Välkommen med din ansökan.*",
    r"Please apply.*",
    r"We do not accept.*",
]

def clean_text(s: str) -> str:
    if not s:
        return ""
    s = s.replace("\r", "\n")
    s = re.sub(r"\s+", " ", s).strip()

    # Remove boilerplate chunks (best-effort)
    for pat in _BOILERPLATE_PATTERNS:
        s = re.sub(pat, "", s, flags=re.IGNORECASE)

    # Final whitespace normalize
    s = re.sub(r"\s+", " ", s).strip()
    return s

def pick_description(desc: str, max_chars: int = 700) -> str:
    """No keyword extraction: just clean + take a compact slice."""
    desc = clean_text(desc)
    if len(desc) <= max_chars:
        return desc
    return desc[:max_chars].rstrip() + "…"

def join_labels(items: Any, label_key: str = "label", max_items: int = 12) -> str:
    if not items or not isinstance(items, list):
        return ""
    labels = []
    for it in items[:max_items]:
        if isinstance(it, dict) and it.get(label_key):
            labels.append(str(it[label_key]))
        elif isinstance(it, str):
            labels.append(it)
    # uniq preserve order
    seen = set()
    out = []
    for x in labels:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return ", ".join(out)

def safe_get(d: Dict[str, Any], path: List[str]) -> Optional[Any]:
    cur: Any = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur

def build_job_embedding_text(row: Dict[str, Any]) -> str:
    """
    Prefer source_snapshot (raw Platsbanken JSON) if available.
    Otherwise fall back to flattened columns.
    """
    snap = row.get("source_snapshot")
    if isinstance(snap, str):
        try:
            snap = json.loads(snap)
        except:
            snap = None
    if not isinstance(snap, dict):
        snap = {}

    # Headline
    headline = snap.get("headline") or row.get("headline") or ""

    # Taxonomy labels
    occupation = safe_get(snap, ["occupation", "label"]) or row.get("job_category") or ""
    occ_group = safe_get(snap, ["occupation_group", "label"]) or ""
    occ_field = safe_get(snap, ["occupation_field", "label"]) or ""

    # Employer
    employer_name = safe_get(snap, ["employer", "name"]) or row.get("company") or ""
    workplace = safe_get(snap, ["employer", "workplace"]) or ""

    # Location
    municipality = safe_get(snap, ["workplace_address", "municipality"]) or row.get("city") or row.get("location") or ""
    region = safe_get(snap, ["workplace_address", "region"]) or ""
    city = safe_get(snap, ["workplace_address", "city"]) or ""

    # Employment details
    employment_type = safe_get(snap, ["employment_type", "label"]) or ""
    working_hours = safe_get(snap, ["working_hours_type", "label"]) or ""
    duration = safe_get(snap, ["duration", "label"]) or ""

    # Requirements (structured)
    must_lang = join_labels(safe_get(snap, ["must_have", "languages"]) or [])
    must_skills = join_labels(safe_get(snap, ["must_have", "skills"]) or [])
    must_exp = join_labels(safe_get(snap, ["must_have", "work_experiences"]) or [])
    must_edu = join_labels(safe_get(snap, ["must_have", "education"]) or [])

    nice_skills = join_labels(safe_get(snap, ["nice_to_have", "skills"]) or [])

    # Description
    desc = safe_get(snap, ["description", "text"]) or row.get("description_text") or ""
    desc = pick_description(desc, max_chars=800)

    parts = [
        f"Job Title: {clean_text(str(headline))}",
        f"Occupation: {clean_text(str(occupation))}",
    ]

    if occ_group:
        parts.append(f"Occupation Group: {clean_text(str(occ_group))}")
    if occ_field:
        parts.append(f"Occupation Field: {clean_text(str(occ_field))}")

    if employer_name or workplace:
        parts.append(f"Employer: {clean_text(str(employer_name))} ({clean_text(str(workplace))})")

    loc_bits = ", ".join([x for x in [clean_text(str(municipality)), clean_text(str(region)), clean_text(str(city))] if x])
    if loc_bits:
        parts.append(f"Location: {loc_bits}")

    emp_bits = ", ".join([x for x in [clean_text(str(employment_type)), clean_text(str(working_hours)), clean_text(str(duration))] if x])
    if emp_bits:
        parts.append(f"Employment: {emp_bits}")

    req_lines = []
    if must_lang: req_lines.append(f"Must-have languages: {must_lang}")
    if must_skills: req_lines.append(f"Must-have skills: {must_skills}")
    if must_exp: req_lines.append(f"Must-have experience: {must_exp}")
    if must_edu: req_lines.append(f"Must-have education: {must_edu}")
    if nice_skills: req_lines.append(f"Nice-to-have skills: {nice_skills}")
    if req_lines:
        parts.append("Requirements: " + " | ".join(req_lines))

    if desc:
        parts.append(f"Description: {desc}")

    text = "\n".join(parts).strip()

    # Keep embedding text in a safe band (~800–1500 chars usually)
    return text[:1500]

async def enrich_job_vectors():
    os.makedirs("logs", exist_ok=True)
    failed_path = "logs/enrich_failed_jobs.jsonl"

    print(f"📦 Enriching Jobs... Model: {EMBEDDING_MODEL} ({DIMS} dims)")

    while True:
        response = (
            supabase.table("job_ads")
            .select("id, headline, description_text, city, location, job_category, company, source_snapshot")
            .is_("embedding", "null")
            .limit(50)
            .execute()
        )

        jobs = response.data
        if not jobs:
            print("✅ No jobs pending vectorization.")
            break

        print(f"🔄 Processing batch of {len(jobs)} jobs...")

        for row in jobs:
            job_id = row["id"]
            try:
                text = build_job_embedding_text(row)
                if not text.strip():
                    raise ValueError("Empty embedding text after processing")

                vector = await get_local_embedding(text)

                supabase.table("job_ads").update(
                    {
                        "embedding": vector,
                        # Optional but VERY useful for debugging:
                        "embedding_text": text,
                    }
                ).eq("id", job_id).execute()

                print(f"✅ Vectorized job {job_id} ({len(text)} chars)")

            except Exception as e:
                print(f"   ❌ Failed {job_id}: {e}")
                with open(failed_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": job_id, "error": str(e)}) + "\n")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())
