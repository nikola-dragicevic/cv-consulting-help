# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import math
from typing import List, Optional

from supabase import create_client, Client
from dotenv import load_dotenv

# Import parsers
try:
    from scripts.parse_cv_pdf import extract_text_from_pdf, extract_text_from_docx, summarize_cv_text
except ImportError:
    from parse_cv_pdf import extract_text_from_pdf, extract_text_from_docx, summarize_cv_text

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# ✅ Prefer /api/embed (batch + normalized vectors)
OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL", "http://ollama:11434/api/embed")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

# Chunking controls (character-based heuristic)
CHUNK_CHARS = int(os.getenv("CHUNK_CHARS", "1800"))     # ~300-500 tokens depending on language
OVERLAP_CHARS = int(os.getenv("OVERLAP_CHARS", "250"))  # keep context continuity
MAX_CHUNKS = int(os.getenv("MAX_CHUNKS", "12"))         # cap compute cost per candidate

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def l2_normalize(vec: List[float]) -> List[float]:
    if not vec:
        return []
    mag = math.sqrt(sum(x * x for x in vec))
    if mag == 0:
        return [0.0] * len(vec)
    return [x / mag for x in vec]

def mean_pool(vectors: List[List[float]]) -> List[float]:
    if not vectors:
        return [0.0] * DIMS
    n = len(vectors)
    out = [0.0] * len(vectors[0])
    for v in vectors:
        for i, x in enumerate(v):
            out[i] += x
    out = [x / n for x in out]
    return out

def clean_text(s: str) -> str:
    if not s:
        return ""
    # Remove null bytes (Postgres killer)
    s = s.replace("\x00", "")
    # Normalize whitespace but keep meaning
    s = s.replace("\r", "\n")
    # You can keep newlines; embeddings can handle them fine
    # Just collapse excessive spaces
    s = "\n".join(line.strip() for line in s.splitlines())
    s = "\n".join([line for line in s.splitlines() if line])
    return s.strip()

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

def build_chunk_inputs(candidate: dict, chunks: List[str]) -> List[str]:
    """
    For nomic-embed-text best practice, use task prefix.
    For similarity search (doc-doc), use search_document on BOTH sides.
    """
    name = (candidate.get("full_name") or "Unknown").strip()
    city = (candidate.get("city") or "").strip()
    headline = (candidate.get("headline") or "").strip()  # if you have it

    header_parts = [f"Candidate: {name}"]
    if city:
        header_parts.append(f"City: {city}")
    if headline:
        header_parts.append(f"Headline: {headline}")

    header = " | ".join(header_parts)

    inputs = []
    for i, ch in enumerate(chunks, start=1):
        # Each chunk is a "document"
        inputs.append(f"search_document: {header}\nCV Chunk {i}/{len(chunks)}:\n{ch}")
    return inputs

async def ollama_embed_batch(inputs: List[str]) -> List[List[float]]:
    """
    Calls Ollama /api/embed with batch input.
    Docs: returns L2-normalized vectors (unit length). :contentReference[oaicite:3]{index=3}
    """
    if not inputs:
        return []

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            OLLAMA_EMBED_URL,
            json={"model": EMBEDDING_MODEL, "input": inputs},
        )
        resp.raise_for_status()
        data = resp.json()

        # Expected shape: {"embeddings": [[...], [...]]}
        embs = data.get("embeddings")
        if embs is None:
            # Fallback (older/odd shapes): {"embedding": [...]}
            single = data.get("embedding")
            if single is not None:
                embs = [single]
            else:
                raise ValueError(f"Unexpected Ollama embed response keys: {list(data.keys())}")

        # Validate dims
        out = []
        for e in embs:
            if not e or len(e) != DIMS:
                got = len(e) if e else 0
                raise ValueError(f"Invalid embedding dims. Expected {DIMS}, got {got}")
            out.append(e)

        return out

async def build_candidate_vector(candidate: dict, cv_text: str) -> Optional[List[float]]:
    cv_text = clean_text(cv_text)
    if len(cv_text) < 50:
        return None

    chunks = chunk_text(cv_text, CHUNK_CHARS, OVERLAP_CHARS, MAX_CHUNKS)
    if not chunks:
        return None

    inputs = build_chunk_inputs(candidate, chunks)

    # Batch embed chunks (fast on GPU)
    chunk_vectors = await ollama_embed_batch(inputs)

    # Mean pool and normalize once (important after pooling)
    pooled = mean_pool(chunk_vectors)
    pooled = l2_normalize(pooled)

    return pooled

def download_and_extract_cv(candidate: dict) -> tuple[str, bool]:
    """
    Returns (cv_text, has_picture_bool)
    For docx/txt: has_picture is False (we only detect images inside PDFs here).
    """
    bucket_path = (candidate.get("cv_bucket_path") or "").strip()
    if not bucket_path:
        return "", False

    is_pdf = bucket_path.lower().endswith(".pdf")
    is_docx = bucket_path.lower().endswith(".docx")

    if is_pdf:
        local_ext = ".pdf"
    elif is_docx:
        local_ext = ".docx"
    else:
        local_ext = ".txt"

    # Use a stable temp name (candidate may have id/user_id)
    cid = candidate.get("id") or candidate.get("user_id") or "unknown"
    local_path = f"/tmp/temp_{cid}{local_ext}"

    has_picture = False
    cv_text = ""

    try:
        data = supabase.storage.from_("cvs").download(bucket_path)
        with open(local_path, "wb") as f:
            f.write(data)

        if is_pdf:
            raw, has_picture = extract_text_from_pdf(local_path)
            cv_text = summarize_cv_text(raw) or ""
        elif is_docx:
            raw = extract_text_from_docx(local_path)
            cv_text = summarize_cv_text(raw) or ""
            has_picture = False
        else:
            with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                raw = f.read()
            cv_text = summarize_cv_text(raw) or ""
            has_picture = False

    finally:
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
        except Exception:
            pass

    return cv_text, has_picture

async def enrich_candidates():
    print("📋 Candidate Vector Generation (Chunked Pooling + /api/embed batch)")

    res = (
        supabase.table("candidate_profiles")
        .select("*")
        .is_("profile_vector", "null")
        .execute()
    )
    candidates = res.data or []

    if not candidates:
        print("✅ No candidates need updating.")
        return

    print(f"📋 Found {len(candidates)} candidates to process.")

    for c in candidates:
        email = c.get("email", "Unknown")
        print(f"\n👤 Processing: {email}")

        try:
            cv_text = c.get("cv_text") or ""  # if you ever store raw text; usually empty
            has_picture = False

            # If cv_text not supplied, download from storage
            if not cv_text.strip():
                cv_text, has_picture = download_and_extract_cv(c)

            if not cv_text or len(cv_text) < 50:
                # Save has_picture even if no text
                try:
                    supabase.table("candidate_profiles").update({
                        "has_picture": bool(has_picture)
                    }).eq("id", c["id"]).execute()
                except Exception as e:
                    print(f"⚠️ Could not update has_picture: {e}")

                print("⏭️ Skipping: No usable CV text (possibly scanned/image-only).")
                continue

            vec = await build_candidate_vector(c, cv_text)
            if vec is None:
                print("⏭️ Skipping: Vector build failed (no chunks).")
                continue

            # Store a compact debug string (not the whole CV)
            debug_preview = clean_text(cv_text)[:2000]
            debug_text = f"search_document: Candidate: {(c.get('full_name') or 'Unknown')}\nCV Preview:\n{debug_preview}"

            supabase.table("candidate_profiles").update({
                "profile_vector": vec,
                "candidate_text_vector": debug_text,
                "has_picture": bool(has_picture),
            }).eq("id", c["id"]).execute()

            print(f"✅ Updated vector for {email} | has_picture={bool(has_picture)}")

        except Exception as e:
            print(f"❌ Failed for {email}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())
