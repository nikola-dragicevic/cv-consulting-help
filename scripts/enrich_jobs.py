# scripts/enrich_jobs.py
import os
import sys
import json
import math
import time
import re
import asyncio
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# ✅ Prefer /api/embed (batch + normalized vectors)
OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL", "http://ollama:11434/api/embed")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

# --- CPU-safe controls ---
BATCH_LIMIT = int(os.getenv("JOB_CPU_BATCH_LIMIT", "8"))
MAX_RETRIES = int(os.getenv("JOB_CPU_MAX_RETRIES", "3"))

# Keep extraction quality, but cap size for CPU stability
MAX_TOTAL_CHARS = int(os.getenv("JOB_CPU_MAX_TOTAL_CHARS", "3500"))
DESC_CHARS = int(os.getenv("JOB_CPU_DESC_CHARS", "1400"))

# Chunked pooling for CPU (smaller than GPU)
CHUNK_CHARS = int(os.getenv("JOB_CPU_CHUNK_CHARS", "900"))
OVERLAP_CHARS = int(os.getenv("JOB_CPU_OVERLAP_CHARS", "120"))
MAX_CHUNKS = int(os.getenv("JOB_CPU_MAX_CHUNKS", "4"))

# Optional: process only rows that are missing embedding or not yet gpu_final
PROCESS_NON_GPU_FINAL = os.getenv("JOB_PROCESS_NON_GPU_FINAL", "true").lower() in ("1", "true", "yes", "y", "on")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ---------------- Vector helpers ----------------
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


async def ollama_embed_batch(client: httpx.AsyncClient, inputs: List[str]) -> List[List[float]]:
    """
    Ollama /api/embed batch. Vectors are normalized per input; we re-normalize after pooling.
    """
    if not inputs:
        return []

    resp = await client.post(
        OLLAMA_EMBED_URL,
        json={"model": EMBEDDING_MODEL, "input": inputs},
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
        if not e or len(e) != DIMS:
            got = len(e) if e else 0
            raise ValueError(f"Invalid embedding dims. Expected {DIMS}, got {got}")
        out.append(e)

    return out


# ---------------- Text extraction / cleaning ----------------
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


def build_job_document(row: Dict[str, Any]) -> Tuple[str, dict]:
    snap = safe_json_loads(row.get("source_snapshot"))

    headline = (row.get("headline") or "").strip()
    category = (row.get("job_category") or "").strip()
    city = (row.get("city") or row.get("location") or "").strip()
    company = (row.get("company") or "").strip()

    fallback_desc = row.get("description_text") or ""
    desc_raw, desc_source = extract_desc_from_snapshot(snap, fallback_desc)

    cleaned_desc, removed_lines = clean_text_preserve_newlines(desc_raw)
    if cleaned_desc:
        cleaned_desc = cleaned_desc[:DESC_CHARS]

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

    # Keep same ordering as GPU, but fewer chars
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

    if len(final_text) > MAX_TOTAL_CHARS:
        final_text = final_text[:MAX_TOTAL_CHARS]

    debug = {
        "desc_source": desc_source,
        "noise_removed_lines": removed_lines,
        **sec_debug,
        "cpu_caps": {
            "max_total_chars": MAX_TOTAL_CHARS,
            "desc_chars": DESC_CHARS,
            "chunk_chars": CHUNK_CHARS,
            "overlap_chars": OVERLAP_CHARS,
            "max_chunks": MAX_CHUNKS,
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
    inputs = []
    for i, ch in enumerate(chunks, start=1):
        inputs.append(f"search_document: JobID: {job_id}\nChunk {i}/{len(chunks)}:\n{ch}")
    return inputs


# ---------------- Column detection (safe) ----------------
def table_has_column(table: str, col: str) -> bool:
    try:
        supabase.table(table).select(col).limit(1).execute()
        return True
    except Exception:
        return False


HAS_QUALITY = table_has_column("job_ads", "embedding_quality")
HAS_NEEDS_GPU = table_has_column("job_ads", "embedding_needs_gpu")
HAS_UPDATED_AT = table_has_column("job_ads", "embedding_updated_at")
HAS_MODEL = table_has_column("job_ads", "embedding_model")
HAS_VERSION = table_has_column("job_ads", "embedding_version")
HAS_PARSE_DEBUG = table_has_column("job_ads", "parse_debug")
HAS_ERROR = table_has_column("job_ads", "embedding_error")


def fetch_jobs_to_process() -> List[Dict[str, Any]]:
    q = supabase.table("job_ads").select("*")

    # If you want to continually refresh non-gpu_final:
    if PROCESS_NON_GPU_FINAL and HAS_QUALITY:
        q = q.neq("embedding_quality", "gpu_final")

    # Primary target for CPU pass: missing embedding
    # (keeps DB stable and avoids rewriting everything)
    q = q.is_("embedding", "null")

    res = q.limit(BATCH_LIMIT).execute()
    return res.data or []


def update_job_success(job_id: str, embedding: List[float], embedding_text: str, debug: dict) -> None:
    payload: Dict[str, Any] = {
        "embedding": embedding,
        "embedding_text": embedding_text,
    }

    if HAS_QUALITY:
        payload["embedding_quality"] = "cpu_quick"
    if HAS_NEEDS_GPU:
        payload["embedding_needs_gpu"] = True
    if HAS_MODEL:
        payload["embedding_model"] = EMBEDDING_MODEL
    if HAS_VERSION:
        payload["embedding_version"] = 2
    if HAS_PARSE_DEBUG:
        payload["parse_debug"] = debug
    if HAS_ERROR:
        payload["embedding_error"] = None

    # NOTE: Supabase client can’t send SQL now(); set server timestamp in DB via trigger if you need.
    # We skip embedding_updated_at here to avoid type issues.

    supabase.table("job_ads").update(payload).eq("id", job_id).execute()


def update_job_error(job_id: str, msg: str) -> None:
    if not HAS_ERROR:
        return
    supabase.table("job_ads").update({"embedding_error": msg[:800]}).eq("id", job_id).execute()


# ---------------- Main loop ----------------
async def enrich_job_vectors():
    print(
        f"📦 CPU Job Enrichment (High-signal extraction within CPU limits)\n"
        f"   Model: {EMBEDDING_MODEL} | dims={DIMS}\n"
        f"   Batch: {BATCH_LIMIT} | retries={MAX_RETRIES}\n"
        f"   Caps: doc={MAX_TOTAL_CHARS} desc={DESC_CHARS}\n"
        f"   Chunks: {MAX_CHUNKS} x {CHUNK_CHARS} (overlap {OVERLAP_CHARS})\n"
        f"   Ollama: {OLLAMA_EMBED_URL}\n"
    )

    async with httpx.AsyncClient(timeout=90.0) as http_client:
        while True:
            jobs: List[Dict[str, Any]] = []

            # DB retry
            for attempt in range(MAX_RETRIES):
                try:
                    jobs = fetch_jobs_to_process()
                    break
                except Exception as e:
                    print(f"⚠️ DB fetch failed ({attempt+1}/{MAX_RETRIES}): {e}")
                    time.sleep(3)

            if not jobs:
                print("✅ Inga fler jobb att vektorisera (CPU pass).")
                break

            print(f"🔄 Processing batch of {len(jobs)}...")

            for row in jobs:
                job_id = str(row.get("id") or "")
                headline = (row.get("headline") or "")[:60]

                try:
                    doc, debug = build_job_document(row)
                    chunks = chunk_text(doc, CHUNK_CHARS, OVERLAP_CHARS, MAX_CHUNKS)
                    if not chunks:
                        raise ValueError("No chunks built from document")

                    inputs = build_chunk_inputs(job_id, chunks)
                    chunk_vecs = await ollama_embed_batch(http_client, inputs)

                    pooled = mean_pool(chunk_vecs, DIMS)
                    pooled = l2_normalize(pooled)

                    # Save with retries
                    saved = False
                    for save_attempt in range(MAX_RETRIES):
                        try:
                            update_job_success(job_id, pooled, doc, debug)
                            saved = True
                            break
                        except Exception as e:
                            print(f"   ⚠️ Save failed ({save_attempt+1}/{MAX_RETRIES}) for {job_id}: {e}")
                            time.sleep(2)

                    if saved:
                        print(f"   ✅ Saved CPU: {headline}...")
                    else:
                        raise ValueError("Could not save after retries")

                except Exception as e:
                    msg = str(e)
                    print(f"   ❌ Failed {job_id} ({headline}): {msg}")
                    try:
                        update_job_error(job_id, msg)
                    except Exception:
                        pass


if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())
