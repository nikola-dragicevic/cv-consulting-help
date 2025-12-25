#!/usr/bin/env python3
"""
scripts/enrich_jobs_GPU.py

Run job vector enrichment locally (GPU) without SSH/server.
- Pulls jobs from Supabase that are missing embeddings
- Creates embeddings via local Ollama (GPU)
- Writes embeddings back to Supabase job_ads.embedding

Usage examples:
  python scripts/enrich_jobs_GPU.py
  python scripts/enrich_jobs_GPU.py --limit 2000 --batch 25
  python scripts/enrich_jobs_GPU.py --only-active true
  python scripts/enrich_jobs_GPU.py --where "embedding.is.null,eq.true"   (optional advanced)
"""

import os
import math
import time
import argparse
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

# --------- Defaults ----------
DEFAULT_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DEFAULT_DIMS = int(os.getenv("DIMS", "768"))
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/embeddings")

# Safe text length (your server uses 1500 chars; keep same for consistency)
MAX_CHARS = int(os.getenv("MAX_CHARS", "1500"))

# ---------- Helpers ----------
def normalize_vector(vector: List[float]) -> List[float]:
    if not vector:
        return []
    mag = math.sqrt(sum(x * x for x in vector))
    if mag == 0:
        return [0.0] * len(vector)
    return [x / mag for x in vector]

def build_job_text(row: Dict[str, Any]) -> str:
    """
    Adjust these fields to match your schema.
    Typical job_ads fields: headline, description_text, company_name, location, occupation, etc.
    """
    headline = (row.get("headline") or "").strip()
    desc = (row.get("description_text") or "").strip()
    company = (row.get("employer_name") or row.get("company_name") or "").strip()
    location = (row.get("location") or row.get("city") or "").strip()
    category = (row.get("job_category") or "").strip()

    parts = []
    if headline:
        parts.append(f"Headline: {headline}")
    if company:
        parts.append(f"Company: {company}")
    if location:
        parts.append(f"Location: {location}")
    if category:
        parts.append(f"Category: {category}")
    if desc:
        parts.append(f"Description:\n{desc}")

    text = "\n".join(parts).strip()

    # Remove null bytes (Postgres killer)
    text = text.replace("\x00", "")

    # Truncate to keep embedding stable + fast
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    return text

async def fetch_embedding(
    client: httpx.AsyncClient,
    ollama_url: str,
    model: str,
    dims: int,
    text: str
) -> Optional[List[float]]:
    if not text or not text.strip():
        return None

    resp = await client.post(ollama_url, json={"model": model, "prompt": text})
    resp.raise_for_status()
    data = resp.json()
    emb = data.get("embedding")

    if not emb or len(emb) != dims:
        got = len(emb) if emb else 0
        raise ValueError(f"Ollama returned invalid dims. Expected {dims}, got {got}")

    return normalize_vector(emb)

def parse_bool(s: str) -> bool:
    return str(s).lower() in ("1", "true", "yes", "y", "on")

# ---------- Supabase fetch/update ----------
def fetch_jobs_to_enrich(
    supabase: Client,
    limit: int,
    only_active: Optional[bool] = None,
    min_chars: int = 50,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs missing embeddings. Adjust filters to your schema.
    """
    q = supabase.table("job_ads").select(
        "id, headline, description_text, employer_name, company_name, location, city, job_category, is_active"
    ).is_("embedding", "null")

    if only_active is True:
        q = q.eq("is_active", True)
    elif only_active is False:
        q = q.eq("is_active", False)

    # If you want to avoid ultra-short descriptions, do it client-side.
    # (PostgREST doesn't have great text length filters.)
    res = q.limit(limit).execute()
    rows = res.data or []

    filtered = []
    for r in rows:
        text = build_job_text(r)
        if len(text) >= min_chars:
            filtered.append(r)
    return filtered

def update_job_embedding(
    supabase: Client,
    job_id: Any,
    embedding: List[float],
) -> None:
    # You may have "embedding_updated_at" or similar; add if exists
    payload = {
        "embedding": embedding,
        # "embedding_updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    supabase.table("job_ads").update(payload).eq("id", job_id).execute()

# ---------- Main ----------
async def main():
    load_dotenv()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment/.env")

    parser = argparse.ArgumentParser(description="Enrich job embeddings locally via Ollama GPU.")
    parser.add_argument("--limit", type=int, default=1000, help="Max jobs to process this run.")
    parser.add_argument("--batch", type=int, default=20, help="Batch size per round-trip.")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Ollama embedding model.")
    parser.add_argument("--dims", type=int, default=DEFAULT_DIMS, help="Expected embedding dims.")
    parser.add_argument("--ollama-url", type=str, default=DEFAULT_OLLAMA_URL, help="Ollama embeddings endpoint.")
    parser.add_argument("--only-active", type=str, default="true", help="true/false/empty to not filter.")
    parser.add_argument("--min-chars", type=int, default=50, help="Skip jobs whose built text is shorter than this.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep seconds between batches (throttle).")
    args = parser.parse_args()

    only_active: Optional[bool]
    if args.only_active.strip() == "":
        only_active = None
    else:
        only_active = parse_bool(args.only_active)

    supabase: Client = create_client(supabase_url, supabase_key)

    # Quick health check for Ollama
    print(f"🔧 Using Ollama: {args.ollama_url}")
    print(f"🧠 Model: {args.model} | dims={args.dims} | MAX_CHARS={MAX_CHARS}")
    print(f"📦 Supabase: {supabase_url}")

    processed = 0
    failures = 0
    start_time = time.time()

    async with httpx.AsyncClient(timeout=120.0) as http_client:
        while processed < args.limit:
            remaining = args.limit - processed
            fetch_n = min(args.batch, remaining)

            rows = fetch_jobs_to_enrich(
                supabase,
                limit=fetch_n,
                only_active=only_active,
                min_chars=args.min_chars
            )

            if not rows:
                print("✅ No more jobs missing embeddings (or all remaining are too short).")
                break

            print(f"\n➡️  Processing batch: {len(rows)} jobs (processed={processed}/{args.limit})")

            for r in rows:
                job_id = r.get("id")
                try:
                    text = build_job_text(r)
                    emb = await fetch_embedding(http_client, args.ollama_url, args.model, args.dims, text)
                    if not emb:
                        print(f"⚠️  Skip (empty text): {job_id}")
                        failures += 1
                        continue

                    update_job_embedding(supabase, job_id, emb)
                    processed += 1
                    if processed % 25 == 0:
                        elapsed = time.time() - start_time
                        rate = processed / elapsed if elapsed > 0 else 0
                        print(f"📈 Progress: {processed} jobs | {rate:.2f} jobs/sec")

                except Exception as e:
                    failures += 1
                    print(f"❌ Failed job {job_id}: {e}")

            if args.sleep > 0:
                time.sleep(args.sleep)

    elapsed = time.time() - start_time
    rate = processed / elapsed if elapsed > 0 else 0
    print("\n--- DONE ---")
    print(f"✅ Embedded: {processed}")
    print(f"❌ Failures: {failures}")
    print(f"⏱️  Time: {elapsed:.1f}s | Rate: {rate:.2f} jobs/sec")

if __name__ == "__main__":
    import asyncio as _asyncio
    _asyncio.run(main())
