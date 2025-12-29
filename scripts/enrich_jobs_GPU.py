#!/usr/bin/env python3
"""
scripts/enrich_jobs_GPU.py

GPU/local job vector enrichment without SSH/server.
- Pulls jobs from Supabase that are missing embeddings
- Builds a clean, prefix-aligned "search_document:" text
- Chunks + embeds via Ollama /api/embed (batch)
- Mean-pools chunk vectors + final L2 normalize
- Writes embeddings back to Supabase: job_ads.embedding (+ embedding_text)

Usage:
  python scripts/enrich_jobs_GPU.py
  python scripts/enrich_jobs_GPU.py --limit 2000 --batch 25
  python scripts/enrich_jobs_GPU.py --only-active true
"""

import os
import re
import json
import math
import time
import argparse
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------- Defaults / Env ----------------
DEFAULT_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DEFAULT_DIMS = int(os.getenv("DIMS", "768"))

# ✅ Prefer /api/embed for batch + normalized vectors
DEFAULT_OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL", "http://localhost:11434/api/embed")

# Chunking (char-based heuristic)
CHUNK_CHARS = int(os.getenv("JOB_CHUNK_CHARS", "1800"))
OVERLAP_CHARS = int(os.getenv("JOB_OVERLAP_CHARS", "250"))
MAX_CHUNKS = int(os.getenv("JOB_MAX_CHUNKS", "10"))

# Optional cap for what you store in embedding_text (debug)
DEBUG_TEXT_MAX_CHARS = int(os.getenv("JOB_EMBEDDING_TEXT_MAX_CHARS", "2500"))

# Pull fields from job_ads
SELECT_FIELDS = (
    "id, headline, description_text, employer_name, company_name, location, city, "
    "job_category, is_active, source_snapshot"
)

# ---------------- Vector helpers ----------------
def l2_normalize(vec: List[float]) -> List[float]:
    if not vec:
        return []
    mag = math.sqrt(sum(x * x for x in vec))
    if mag == 0:
        return [0.0] * len(vec)
    return [x / mag for x in vec]

def mean_pool(vectors: List[List[float]]) -> List[float]:
    if not vectors:
        return []
    n = len(vectors)
    out = [0.0] * len(vectors[0])
    for v in vectors:
        for i, x in enumerate(v):
            out[i] += x
    out = [x / n for x in out]
    return out

# ---------------- Text cleaning & building ----------------
BOILERPLATE_PATTERNS = [
    r"Öppen för alla.*",
    r"Vi fokuserar på din kompetens.*",
    r"Var ligger arbetsplatsen.*",
    r"Postadress.*",
    r"Ansök.*",
    r"Sök jobbet.*",
    r"Arbetsgivaren har tagit bort annonsen.*",
]

def clean_text(s: str) -> str:
    """
    Keep Unicode. Remove null bytes + common boilerplate + normalize whitespace.
    """
    if not s:
        return ""

    s = s.replace("\x00", "")  # Postgres killer
    s = s.replace("\r", "\n")

    # Strip lines, remove empty
    lines = [ln.strip() for ln in s.splitlines()]
    lines = [ln for ln in lines if ln]

    # Remove boilerplate lines
    out_lines = []
    for ln in lines:
        drop = False
        for pat in BOILERPLATE_PATTERNS:
            if re.search(pat, ln, flags=re.IGNORECASE):
                drop = True
                break
        if not drop:
            out_lines.append(ln)

    s = "\n".join(out_lines).strip()

    # Collapse repeated spaces (keep newlines)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()

def extract_skills_from_snapshot(snapshot: Any) -> str:
    """
    Extract explicit skills from Arbetsförmedlingen snapshot structure if present.
    Uses same idea as your server script: must/nice skills.
    """
    snap = snapshot
    if isinstance(snap, str):
        try:
            snap = json.loads(snap)
        except Exception:
            snap = {}

    if not isinstance(snap, dict):
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

def build_job_document_text(row: Dict[str, Any]) -> str:
    """
    Build the base job "document" string (single text), aligned with candidate vectors:
    - MUST start with 'search_document:'
    - Skills first, then headline/category/company/location, then description.
    """
    headline = (row.get("headline") or "").strip()
    category = (row.get("job_category") or "").strip()
    company = (row.get("employer_name") or row.get("company_name") or "").strip()
    location = (row.get("location") or row.get("city") or "").strip()

    desc_raw = row.get("description_text") or ""
    desc = clean_text(desc_raw)

    skills_block = extract_skills_from_snapshot(row.get("source_snapshot"))

    parts: List[str] = []
    parts.append("search_document:")

    if headline:
        parts.append(f"Jobb: {headline}")
    if category:
        parts.append(f"Kategori: {category}")
    if company:
        parts.append(f"Företag: {company}")
    if location:
        parts.append(f"Plats: {location}")

    if skills_block:
        parts.append("Krav & kompetens:")
        parts.append(skills_block)

    if desc:
        parts.append("Beskrivning:")
        parts.append(desc)

    text = "\n".join(parts).strip()
    return text

def chunk_text(text: str, chunk_chars: int, overlap_chars: int, max_chunks: int) -> List[str]:
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    L = len(text)

    while start < L and len(chunks) < max_chunks:
        end = min(start + chunk_chars, L)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= L:
            break
        start = max(0, end - overlap_chars)

    return chunks

def build_chunk_inputs(job_text: str, chunks: List[str]) -> List[str]:
    """
    Each chunk is still a search_document (doc-doc similarity space).
    Keep prefix in each chunk to be safe/consistent.
    """
    inputs = []
    for i, ch in enumerate(chunks, start=1):
        inputs.append(f"{job_text.splitlines()[0]}\nChunk {i}/{len(chunks)}:\n{ch}")
    return inputs

# ---------------- Ollama embed (batch) ----------------
async def ollama_embed_batch(
    http_client: httpx.AsyncClient,
    embed_url: str,
    model: str,
    dims: int,
    inputs: List[str],
) -> List[List[float]]:
    """
    Calls Ollama /api/embed with batch input.
    Expected: {"embeddings": [[...], ...]}
    """
    if not inputs:
        return []

    resp = await http_client.post(embed_url, json={"model": model, "input": inputs})
    resp.raise_for_status()
    data = resp.json()

    embs = data.get("embeddings")
    if embs is None:
        # Fallback support
        single = data.get("embedding")
        if single is not None:
            embs = [single]
        else:
            raise ValueError(f"Unexpected Ollama response keys: {list(data.keys())}")

    out = []
    for e in embs:
        if not e or len(e) != dims:
            got = len(e) if e else 0
            raise ValueError(f"Invalid embedding dims. Expected {dims}, got {got}")
        out.append(e)
    return out

# ---------------- Supabase I/O ----------------
def parse_bool(s: str) -> bool:
    return str(s).lower() in ("1", "true", "yes", "y", "on")

def fetch_jobs_to_enrich(
    supabase: Client,
    limit: int,
    only_active: Optional[bool] = None,
    min_chars: int = 80,
) -> List[Dict[str, Any]]:
    q = supabase.table("job_ads").select(SELECT_FIELDS).is_("embedding", "null")

    if only_active is True:
        q = q.eq("is_active", True)
    elif only_active is False:
        q = q.eq("is_active", False)

    res = q.limit(limit).execute()
    rows = res.data or []

    filtered = []
    for r in rows:
        base = build_job_document_text(r)
        if len(base) >= min_chars:
            filtered.append(r)
    return filtered

def update_job_embedding(
    supabase: Client,
    job_id: Any,
    embedding: List[float],
    embedding_text: str,
) -> None:
    payload = {
        "embedding": embedding,
        "embedding_text": embedding_text[:DEBUG_TEXT_MAX_CHARS],
    }
    supabase.table("job_ads").update(payload).eq("id", job_id).execute()

# ---------------- Main ----------------
async def main():
    load_dotenv()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment/.env")

    parser = argparse.ArgumentParser(description="Enrich job embeddings locally via Ollama GPU (/api/embed + chunk pooling).")
    parser.add_argument("--limit", type=int, default=1000, help="Max jobs to process this run.")
    parser.add_argument("--batch", type=int, default=20, help="How many jobs to fetch per round-trip.")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Ollama embedding model.")
    parser.add_argument("--dims", type=int, default=DEFAULT_DIMS, help="Expected embedding dims.")
    parser.add_argument("--embed-url", type=str, default=DEFAULT_OLLAMA_EMBED_URL, help="Ollama /api/embed endpoint.")
    parser.add_argument("--only-active", type=str, default="true", help="true/false/empty to not filter.")
    parser.add_argument("--min-chars", type=int, default=80, help="Skip jobs whose built text is shorter than this.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep seconds between batches (throttle).")
    args = parser.parse_args()

    only_active: Optional[bool]
    if args.only_active.strip() == "":
        only_active = None
    else:
        only_active = parse_bool(args.only_active)

    supabase: Client = create_client(supabase_url, supabase_key)

    print(f"🔧 Using Ollama embed: {args.embed_url}")
    print(f"🧠 Model: {args.model} | dims={args.dims}")
    print(f"📦 Supabase: {supabase_url}")
    print(f"🧩 Chunking: CHUNK_CHARS={CHUNK_CHARS} OVERLAP_CHARS={OVERLAP_CHARS} MAX_CHUNKS={MAX_CHUNKS}")

    processed = 0
    failures = 0
    start_time = time.time()

    async with httpx.AsyncClient(timeout=180.0) as http_client:
        while processed < args.limit:
            remaining = args.limit - processed
            fetch_n = min(args.batch, remaining)

            rows = fetch_jobs_to_enrich(
                supabase,
                limit=fetch_n,
                only_active=only_active,
                min_chars=args.min_chars,
            )

            if not rows:
                print("✅ No more jobs missing embeddings (or all remaining are too short).")
                break

            print(f"\n➡️  Processing batch: {len(rows)} jobs (processed={processed}/{args.limit})")

            for r in rows:
                job_id = r.get("id")
                try:
                    base_text = build_job_document_text(r)

                    # Chunk + embed + pool
                    chunks = chunk_text(base_text, CHUNK_CHARS, OVERLAP_CHARS, MAX_CHUNKS)
                    if not chunks:
                        print(f"⚠️  Skip (no chunks): {job_id}")
                        failures += 1
                        continue

                    # Each chunk becomes an input
                    inputs = build_chunk_inputs(base_text, chunks)

                    chunk_vectors = await ollama_embed_batch(
                        http_client,
                        embed_url=args.embed_url,
                        model=args.model,
                        dims=args.dims,
                        inputs=inputs,
                    )

                    pooled = mean_pool(chunk_vectors)
                    pooled = l2_normalize(pooled)

                    if not pooled or len(pooled) != args.dims:
                        print(f"⚠️  Skip (bad pooled vector): {job_id}")
                        failures += 1
                        continue

                    update_job_embedding(supabase, job_id, pooled, base_text)
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
