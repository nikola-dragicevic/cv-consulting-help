#!/usr/bin/env python3
"""
scripts/enrich_jobs_GPU.py

High-quality GPU enrichment (manual local run).
- Fetch jobs marked for GPU upgrade (embedding_needs_gpu = true)
- Build high-signal extraction (snapshot-first, section-aware, noise removal)
- Chunked pooling via Ollama /api/embed (batch input)
- Overwrite embedding only when GPU succeeds
- Mark embedding_quality='gpu_final' and embedding_needs_gpu=false on success
"""

import os
import sys
import json
import math
import time
import argparse
import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client


# ------------------- Env / Defaults -------------------
load_dotenv()

DEFAULT_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DEFAULT_DIMS = int(os.getenv("DIMS", "768"))

# Local GPU Ollama
DEFAULT_OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL", "http://localhost:11434/api/embed")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment/.env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


# ------------------- Vector helpers -------------------
def l2_normalize(vec: List[float]) -> List[float]:
    if not vec:
        return []
    mag = math.sqrt(sum(x * x for x in vec))
    if mag == 0:
        return [0.0] * len(vec)
    return [x / mag for x in vec]


def mean_pool(vectors: List[List[float]], dims: int) -> List[float]:
    if not vectors:
        return [0.0] * dims
    out = [0.0] * dims
    n = len(vectors)
    for v in vectors:
        for i, x in enumerate(v):
            out[i] += x
    return [x / n for x in out]


async def ollama_embed_batch(
    client: httpx.AsyncClient,
    ollama_embed_url: str,
    model: str,
    dims: int,
    inputs: List[str],
) -> List[List[float]]:
    """
    Ollama /api/embed batch.
    Expect: {"embeddings": [[...],[...]]}
    """
    if not inputs:
        return []

    resp = await client.post(
        ollama_embed_url,
        json={"model": model, "input": inputs},
    )
    resp.raise_for_status()
    data = resp.json()

    embs = data.get("embeddings")
    if embs is None:
        single = data.get("embedding")
        if single is not None:
            embs = [single]
        else:
            raise ValueError(f"Unexpected /api/embed response keys: {list(data.keys())}")

    out: List[List[float]] = []
    for e in embs:
        if not e or len(e) != dims:
            got = len(e) if e else 0
            raise ValueError(f"Invalid embedding dims. Expected {dims}, got {got}")
        out.append(e)

    return out


# ------------------- Snapshot helpers -------------------
def safe_json_loads(maybe_json: Any) -> dict:
    if isinstance(maybe_json, dict):
        return maybe_json
    if isinstance(maybe_json, str) and maybe_json.strip():
        try:
            return json.loads(maybe_json)
        except Exception:
            return {}
    return {}


def extract_desc_from_snapshot(snap: dict, fallback_desc: str) -> Tuple[str, str]:
    desc_obj = snap.get("description") or {}
    if isinstance(desc_obj, dict):
        tf = desc_obj.get("text_formatted")
        if isinstance(tf, str) and tf.strip():
            return tf, "snapshot.description.text_formatted"
        t = desc_obj.get("text")
        if isinstance(t, str) and t.strip():
            return t, "snapshot.description.text"
    return (fallback_desc or ""), "row.description_text"


def extract_skills_from_snapshot(snap: dict) -> str:
    must = snap.get("must_have", {}).get("skills", []) if isinstance(snap.get("must_have"), dict) else []
    nice = snap.get("nice_to_have", {}).get("skills", []) if isinstance(snap.get("nice_to_have"), dict) else []

    must_labels = [s.get("label") for s in must if isinstance(s, dict) and s.get("label")]
    nice_labels = [s.get("label") for s in nice if isinstance(s, dict) and s.get("label")]

    parts = []
    if must_labels:
        parts.append(f"Krav: {', '.join(must_labels)}.")
    if nice_labels:
        parts.append(f"Meriterande: {', '.join(nice_labels)}.")
    return " ".join(parts).strip()


# ------------------- Cleaning + Sectionizing -------------------
NOISE_LINE_PATTERNS = [
    r"Öppen för alla",
    r"Vi fokuserar på din kompetens",
    r"Var ligger arbetsplatsen",
    r"Postadress",
    r"Ansök",
    r"Sök jobbet",
    r"Arbetsgivaren har tagit bort annonsen",
    r"Kontakt(uppgifter)?",
    r"Facklig(a)?",
    r"Intervjuer sker löpande",
    r"Urval sker löpande",
    r"Välkommen med din ansökan",
    r"GDPR",
    r"Rekryteringsprocess",
    r"Vi undanber oss",
    r"Vi undanber oss kontakt från",
    r"Samtycke",
    r"Personuppgifter",
]

KEEP_SECTION_PATTERNS = [
    (r"^arbetsuppgifter\b", "arbetsuppgifter"),
    (r"^dina arbetsuppgifter\b", "arbetsuppgifter"),
    (r"^arbetsbeskrivning\b", "arbetsuppgifter"),
    (r"^huvudsakliga arbetsuppgifter\b", "arbetsuppgifter"),
    (r"^kvalifikationer\b", "kvalifikationer"),
    (r"^krav\b", "krav"),
    (r"^kravprofil\b", "krav"),
    (r"^vi söker\b", "krav"),
    (r"^meriterande\b", "meriterande"),
    (r"^kompetens\b", "kompetens"),
    (r"^profil\b", "profil"),
    (r"^personliga egenskaper\b", "profil"),
    (r"^om tjänsten\b", "om_tjänsten"),
    (r"^om rollen\b", "om_tjänsten"),
    (r"^villkor\b", "villkor"),
    (r"^anställningsform\b", "villkor"),
    (r"^om arbetsplatsen\b", "om_arbetsplatsen"),
    (r"^om företaget\b", "om_arbetsplatsen"),
    (r"^vi erbjuder\b", "erbjudande"),
    (r"^erbjuder vi\b", "erbjudande"),
]

DROP_SECTION_PATTERNS = [
    r"^ansökan\b",
    r"^ansök( idag)?\b",
    r"^så här ansöker du\b",
    r"^kontakt\b",
    r"^kontaktuppgifter\b",
    r"^facklig(a)?\b",
    r"^övrigt\b",
    r"^rekryteringsprocess\b",
]


def clean_text_preserve_newlines(s: str) -> Tuple[str, int]:
    if not s:
        return "", 0
    s = s.replace("\x00", "").replace("\r", "\n")

    removed = 0
    out_lines: List[str] = []
    for line in s.splitlines():
        ln = line.strip()
        if not ln:
            continue
        if any(re.search(p, ln, flags=re.I) for p in NOISE_LINE_PATTERNS):
            removed += 1
            continue
        out_lines.append(ln)

    cleaned = "\n".join(out_lines).strip()
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned, removed


def sectionize_text(cleaned: str) -> Tuple[Dict[str, str], dict]:
    if not cleaned:
        return {}, {"had_headings": False, "kept_sections": []}

    lines = cleaned.splitlines()
    sections: Dict[str, List[str]] = {}
    current_key: Optional[str] = None
    had_heading = False

    keep_compiled = [(re.compile(pat, re.I), key) for pat, key in KEEP_SECTION_PATTERNS]
    drop_compiled = [re.compile(pat, re.I) for pat in DROP_SECTION_PATTERNS]

    def detect_heading(line: str) -> Tuple[Optional[str], Optional[str]]:
        for rx in drop_compiled:
            if rx.search(line):
                return "drop", None
        for rx, key in keep_compiled:
            if rx.search(line):
                return "keep", key
        return None, None

    kept = set()

    for ln in lines:
        kind, key = detect_heading(ln)
        if kind == "drop":
            had_heading = True
            current_key = None
            continue
        if kind == "keep" and key:
            had_heading = True
            current_key = key
            kept.add(key)
            sections.setdefault(key, [])
            continue

        if current_key:
            sections[current_key].append(ln)

    out: Dict[str, str] = {}
    for k, vlines in sections.items():
        txt = "\n".join(vlines).strip()
        if txt:
            out[k] = txt

    return out, {"had_headings": had_heading, "kept_sections": sorted(list(kept))}


def build_job_document(
    row: Dict[str, Any],
    desc_chars: int,
    max_total_chars: int,
) -> Tuple[str, dict]:
    snap = safe_json_loads(row.get("source_snapshot"))

    headline = (row.get("headline") or "").strip()
    category = (row.get("job_category") or "").strip()
    city = (row.get("city") or row.get("location") or "").strip()
    company = (row.get("company") or "").strip()

    fallback_desc = row.get("description_text") or ""
    desc_raw, desc_source = extract_desc_from_snapshot(snap, fallback_desc)

    cleaned_desc, removed_lines = clean_text_preserve_newlines(desc_raw)
    if cleaned_desc:
        cleaned_desc = cleaned_desc[:desc_chars]

    skills_struct = extract_skills_from_snapshot(snap)
    sections, sec_debug = sectionize_text(cleaned_desc)

    parts: List[str] = ["search_document:"]
    parts.append(f"Jobb: {headline}" if headline else "Jobb:")
    if company:
        parts.append(f"Arbetsgivare: {company}")
    if category:
        parts.append(f"Kategori: {category}")
    if city:
        parts.append(f"Plats: {city}")

    if skills_struct:
        parts.append("Kompetens:")
        parts.append(skills_struct)

    # Prefer structured sections
    if sec_debug.get("had_headings") and sections:
        for key, label in [
            ("krav", "Krav:"),
            ("kvalifikationer", "Kvalifikationer:"),
            ("arbetsuppgifter", "Arbetsuppgifter:"),
            ("meriterande", "Meriterande:"),
            ("profil", "Profil:"),
            ("villkor", "Villkor:"),
            ("erbjudande", "Vi erbjuder:"),
            ("om_tjänsten", "Om tjänsten:"),
            ("om_arbetsplatsen", "Om arbetsplatsen:"),
        ]:
            txt = sections.get(key)
            if txt:
                parts.append(label)
                parts.append(txt)
    else:
        if cleaned_desc:
            parts.append("Beskrivning:")
            parts.append(cleaned_desc)

    final_text = "\n".join(parts).strip()
    if len(final_text) > max_total_chars:
        final_text = final_text[:max_total_chars]

    debug = {
        "desc_source": desc_source,
        "noise_removed_lines": removed_lines,
        **sec_debug,
        "gpu_caps": {
            "max_total_chars": max_total_chars,
            "desc_chars": desc_chars,
        },
    }
    return final_text, debug


def chunk_text(text: str, chunk_chars: int, overlap_chars: int, max_chunks: int) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    chunks: List[str] = []
    start = 0
    L = len(text)
    while start < L and len(chunks) < max_chunks:
        end = min(start + chunk_chars, L)
        ch = text[start:end].strip()
        if ch:
            chunks.append(ch)
        if end >= L:
            break
        start = max(0, end - overlap_chars)
    return chunks


def build_chunk_inputs(job_id: str, chunks: List[str]) -> List[str]:
    return [f"search_document: JobID: {job_id}\nChunk {i}/{len(chunks)}:\n{ch}" for i, ch in enumerate(chunks, start=1)]


# ------------------- Column detection (safe) -------------------
def table_has_column(table: str, col: str) -> bool:
    try:
        supabase.table(table).select(col).limit(1).execute()
        return True
    except Exception:
        return False


HAS_QUALITY = table_has_column("job_ads", "embedding_quality")
HAS_NEEDS_GPU = table_has_column("job_ads", "embedding_needs_gpu")
HAS_MODEL = table_has_column("job_ads", "embedding_model")
HAS_VERSION = table_has_column("job_ads", "embedding_version")
HAS_PARSE_DEBUG = table_has_column("job_ads", "parse_debug")
HAS_ERROR = table_has_column("job_ads", "embedding_error")


# ------------------- Supabase fetch/update -------------------
def fetch_jobs_to_upgrade(supabase: Client, limit: int) -> List[Dict[str, Any]]:
    q = supabase.table("job_ads").select("*")

    if HAS_NEEDS_GPU:
        q = q.eq("embedding_needs_gpu", True)
    elif HAS_QUALITY:
        q = q.neq("embedding_quality", "gpu_final")
    else:
        # Fallback: anything with embedding present or missing, your call — default: only those with embeddings
        q = q.not_.is_("embedding", "null")

    res = q.limit(limit).execute()
    return res.data or []


def update_job_gpu_success(
    job_id: Any,
    embedding: List[float],
    embedding_text: str,
    debug: dict,
    model: str,
) -> None:
    payload: Dict[str, Any] = {
        "embedding": embedding,
        "embedding_text": embedding_text,
    }

    if HAS_QUALITY:
        payload["embedding_quality"] = "gpu_final"
    if HAS_NEEDS_GPU:
        payload["embedding_needs_gpu"] = False
    if HAS_MODEL:
        payload["embedding_model"] = model
    if HAS_VERSION:
        payload["embedding_version"] = 2
    if HAS_PARSE_DEBUG:
        payload["parse_debug"] = debug
    if HAS_ERROR:
        payload["embedding_error"] = None

    supabase.table("job_ads").update(payload).eq("id", job_id).execute()


def update_job_gpu_error(job_id: Any, msg: str) -> None:
    if not HAS_ERROR:
        return
    supabase.table("job_ads").update({"embedding_error": msg[:800]}).eq("id", job_id).execute()


# ------------------- Main -------------------
def parse_bool(s: str) -> bool:
    return str(s).lower() in ("1", "true", "yes", "y", "on")


async def main():
    parser = argparse.ArgumentParser(description="GPU job enrichment (upgrade CPU embeddings to gpu_final).")
    parser.add_argument("--limit", type=int, default=2000, help="Max jobs to process this run.")
    parser.add_argument("--batch", type=int, default=32, help="How many jobs to fetch per loop.")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Ollama embedding model.")
    parser.add_argument("--dims", type=int, default=DEFAULT_DIMS, help="Expected embedding dims.")
    parser.add_argument("--ollama-embed-url", type=str, default=DEFAULT_OLLAMA_EMBED_URL, help="Ollama /api/embed endpoint.")
    parser.add_argument("--desc-chars", type=int, default=int(os.getenv("JOB_GPU_DESC_CHARS", "3500")), help="Description cap for GPU.")
    parser.add_argument("--max-total-chars", type=int, default=int(os.getenv("JOB_GPU_MAX_TOTAL_CHARS", "8000")), help="Final doc cap.")
    parser.add_argument("--chunk-chars", type=int, default=int(os.getenv("JOB_GPU_CHUNK_CHARS", "1400")), help="Chunk size.")
    parser.add_argument("--overlap-chars", type=int, default=int(os.getenv("JOB_GPU_OVERLAP_CHARS", "200")), help="Overlap size.")
    parser.add_argument("--max-chunks", type=int, default=int(os.getenv("JOB_GPU_MAX_CHUNKS", "10")), help="Max chunks pooled per job.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep seconds between loops (throttle).")
    args = parser.parse_args()

    print(f"🧠 GPU Enrich (manual)")
    print(f"   Supabase: {SUPABASE_URL}")
    print(f"   Ollama:   {args.ollama_embed_url}")
    print(f"   Model:    {args.model} dims={args.dims}")
    print(f"   Caps:     desc={args.desc_chars} doc={args.max_total_chars}")
    print(f"   Chunks:   max={args.max_chunks} size={args.chunk_chars} overlap={args.overlap_chars}")
    print(f"   Will overwrite embedding only on success.\n")

    processed = 0
    failures = 0
    started = time.time()

    async with httpx.AsyncClient(timeout=180.0) as http_client:
        while processed < args.limit:
            remaining = args.limit - processed
            fetch_n = min(args.batch, remaining)

            rows = fetch_jobs_to_upgrade(supabase, fetch_n)
            if not rows:
                print("✅ No more jobs flagged for GPU upgrade.")
                break

            print(f"➡️  Processing batch: {len(rows)} jobs (done={processed}/{args.limit})")

            for row in rows:
                job_id = row.get("id")
                headline = (row.get("headline") or "")[:60]
                try:
                    doc, debug = build_job_document(row, args.desc_chars, args.max_total_chars)

                    chunks = chunk_text(doc, args.chunk_chars, args.overlap_chars, args.max_chunks)
                    if not chunks:
                        raise ValueError("No chunks built from document")

                    inputs = build_chunk_inputs(str(job_id), chunks)
                    vecs = await ollama_embed_batch(http_client, args.ollama_embed_url, args.model, args.dims, inputs)

                    pooled = mean_pool(vecs, args.dims)
                    pooled = l2_normalize(pooled)

                    update_job_gpu_success(job_id, pooled, doc, debug, args.model)
                    processed += 1

                    if processed % 50 == 0:
                        elapsed = time.time() - started
                        rate = processed / elapsed if elapsed > 0 else 0
                        print(f"📈 Progress: {processed} jobs | {rate:.2f} jobs/sec")

                except Exception as e:
                    failures += 1
                    msg = str(e)
                    print(f"❌ Failed {job_id} ({headline}): {msg}")
                    try:
                        update_job_gpu_error(job_id, msg)
                    except Exception:
                        pass
                    # IMPORTANT: we do NOT delete/reset CPU embedding; job remains cpu_quick unless overwritten later.

            if args.sleep > 0:
                time.sleep(args.sleep)

    elapsed = time.time() - started
    rate = processed / elapsed if elapsed > 0 else 0
    print("\n--- DONE ---")
    print(f"✅ Upgraded to GPU: {processed}")
    print(f"❌ Failures:       {failures}")
    print(f"⏱️  Time:          {elapsed:.1f}s | Rate: {rate:.2f} jobs/sec")


if __name__ == "__main__":
    asyncio.run(main())
