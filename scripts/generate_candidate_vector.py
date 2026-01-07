# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import math
import re
from typing import List, Optional, Tuple, Dict

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

# Prefer /api/embed (batch + L2-normalized vectors)
OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL", "http://ollama:11434/api/embed")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

# Chunking controls (character heuristic)
CHUNK_CHARS = int(os.getenv("CHUNK_CHARS", "1800"))
OVERLAP_CHARS = int(os.getenv("OVERLAP_CHARS", "250"))
MAX_CHUNKS = int(os.getenv("MAX_CHUNKS", "12"))

# Signal extraction tuning
MIN_SIGNAL_CHARS = int(os.getenv("MIN_SIGNAL_CHARS", "350"))   # if extractor yields less -> fallback to cleaned CV
MAX_DEBUG_PREVIEW = int(os.getenv("MAX_DEBUG_PREVIEW", "2000"))


supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


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
        return [0.0] * DIMS
    n = len(vectors)
    out = [0.0] * len(vectors[0])
    for v in vectors:
        for i, x in enumerate(v):
            out[i] += x
    return [x / n for x in out]


# ---------------- Text cleaning ----------------

def clean_text_keep_unicode(s: str) -> str:
    """
    Keep Unicode (Swedish chars). Remove null bytes + normalize newlines/spaces.
    """
    if not s:
        return ""
    s = s.replace("\x00", "")
    s = s.replace("\r", "\n")
    lines = [ln.strip() for ln in s.splitlines()]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines).strip()


# ---------------- CV signal extraction ----------------

_HEADING_MAP = {
    # Experience
    "experience": "experience",
    "work experience": "experience",
    "arbetslivserfarenhet": "experience",
    "erfarenhet": "experience",
    "anställningar": "experience",
    "anstallningar": "experience",

    # Education
    "education": "education",
    "utbildning": "education",

    # Skills
    "skills": "skills",
    "kompetens": "skills",
    "kunskaper": "skills",
    "färdigheter": "skills",
    "fardigheter": "skills",

    # Licenses/Certs
    "certifikat": "licenses",
    "certifications": "licenses",
    "certification": "licenses",
    "körkort": "licenses",
    "korkort": "licenses",
    "truckkort": "licenses",
    "licenser": "licenses",
    "licenses": "licenses",

    # Languages
    "språk": "languages",
    "sprak": "languages",
    "languages": "languages",

    # References (drop)
    "referenser": "references",
    "references": "references",
}

def _normalize_heading(line: str) -> str:
    x = line.strip().lower()
    # remove surrounding punctuation
    x = re.sub(r"^[=\-•\s]+|[=\-•\s:]+$", "", x)
    return x

def _is_heading(line: str) -> Optional[str]:
    """
    Return canonical heading key or None.
    """
    norm = _normalize_heading(line)
    if not norm:
        return None
    # exact match
    if norm in _HEADING_MAP:
        return _HEADING_MAP[norm]
    # common heading patterns like "=== EXPERIENCE ==="
    if re.fullmatch(r"[a-zåäö\s]{3,40}", norm) and norm in _HEADING_MAP:
        return _HEADING_MAP[norm]
    return None

def _looks_like_contact_line(line: str) -> bool:
    l = line.lower()

    # email
    if "@" in line and "." in line:
        return True

    # phone-ish
    if re.search(r"(\+46|0\d{1,3})[\s\-]?\d{2,4}[\s\-]?\d{2,4}[\s\-]?\d{0,4}", line):
        return True

    # personal/address indicators
    contact_keywords = [
        "telefon", "mobil", "e-post", "email", "mail",
        "adress", "postnummer", "zipcode",
        "linkedin", "github",
        "personnummer",
    ]
    if any(k in l for k in contact_keywords):
        return True

    # street-ish
    if re.search(r"\b(vägen|väg|gatan|gata|street|st\.|box)\b", l):
        return True

    return False

def _drop_contact_block(lines: List[str]) -> List[str]:
    """
    If CV starts with a contact section, drop it.
    Heuristic: if first ~25 lines contains 'kontakt' or many contact-like lines, remove until first real heading.
    """
    if not lines:
        return lines

    top = lines[:25]
    top_low = " ".join([x.lower() for x in top])

    likely_contact = ("kontakt" in top_low) or (sum(1 for x in top if _looks_like_contact_line(x)) >= 3)
    if not likely_contact:
        return lines

    # remove lines until we hit a known heading (experience/skills/education/...)
    for i, ln in enumerate(lines):
        h = _is_heading(ln)
        if h in ("experience", "skills", "education", "licenses", "languages"):
            return lines[i:]
    # if no heading found, just remove first 15 lines
    return lines[15:]

def _extract_skill_tokens(all_text: str) -> str:
    """
    Pull out high-signal technical tokens:
    - ALLCAPS tokens (PLC, SCADA, HMI)
    - tokens w/ digits/hyphens (S7-300, IEC/ISA 62443)
    - short tool phrases (WinCC, Kepware, Modbus, OPC, SQL, Python, C# ...)
    This is intentionally heuristic but works well on your CVs.
    """
    if not all_text:
        return ""

    tokens = set()

    # ALLCAPS tokens
    for m in re.finditer(r"\b[A-ZÅÄÖ]{2,10}\b", all_text):
        tokens.add(m.group(0))

    # digit/hyphen tokens
    for m in re.finditer(r"\b[A-Za-z]{1,6}[-/ ]?\d{2,5}(?:[-/]\d{2,5})?\b", all_text):
        tokens.add(m.group(0))

    # common tech words (expandable)
    common = [
        "PLC", "SCADA", "HMI", "WMS", "SQL", "Python", "Java", "JavaScript", "TypeScript",
        "C#", "C++", "Docker", "Kubernetes", "Linux", "Windows",
        "WinCC", "Siemens", "TIA Portal", "S7", "S7-300", "S7-400",
        "OPC", "Modbus", "Profibus", "Profinet",
        "Supabase", "PostgreSQL", "pgvector",
        "FastAPI", "Next.js", "React",
        "ISA", "IEC", "62443",
    ]
    low = all_text.lower()
    for w in common:
        if w.lower() in low:
            tokens.add(w)

    # keep it stable and not huge
    out = sorted(tokens)
    out = out[:80]
    return ", ".join(out)

def extract_cv_signals(candidate: dict, cv_text: str) -> str:
    """
    Build a compact, high-signal document for embedding.
    If extraction becomes too short, caller should fallback to cleaned raw CV.
    """
    raw = clean_text_keep_unicode(cv_text)
    if not raw:
        return ""

    lines = raw.splitlines()
    lines = _drop_contact_block(lines)

    # Section capture
    sections: Dict[str, List[str]] = {
        "skills": [],
        "licenses": [],
        "experience": [],
        "education": [],
        "languages": [],
    }

    current: Optional[str] = None

    for ln in lines:
        h = _is_heading(ln)
        if h:
            # Drop references section entirely
            if h == "references":
                current = "references"
                continue
            current = h
            continue

        # Remove contact lines anywhere
        if _looks_like_contact_line(ln):
            continue

        # Drop content inside references section
        if current == "references":
            continue

        # If we haven't hit a heading yet, we still keep some lines,
        # but we don't want long generic profile paragraphs.
        if current is None:
            # Keep short high-signal lines only (contain tech, years, role words)
            if re.search(r"\b(PLC|SCADA|HMI|WMS|SQL|Python|Java|C#|Siemens|automation|automatis|control|warehouse|lager|truck)\b", ln, flags=re.I):
                sections["skills"].append(ln)
            elif re.search(r"\b(20\d{2}|19\d{2})\b", ln):
                sections["experience"].append(ln)
            continue

        if current in sections:
            sections[current].append(ln)
        else:
            # ignore unknown sections
            pass

    # Compress experience: remove very long paragraphs, keep bullet-ish and date/company/title lines
    exp_out: List[str] = []
    for ln in sections["experience"]:
        if len(ln) > 240:
            # keep only the first chunk of long lines
            ln = ln[:240].rstrip()
        if re.search(r"\b(20\d{2}|19\d{2})\b", ln) or ln.startswith(("•", "-", "●")):
            exp_out.append(ln)
        elif re.search(r"\b(technician|engineer|operator|specialist|automation|automatis|process|warehouse|lager)\b", ln, flags=re.I):
            exp_out.append(ln)

    exp_out = exp_out[:60]  # cap

    # Skills/licenses are usually lists -> keep more
    skills_out = sections["skills"][:60]
    lic_out = sections["licenses"][:30]
    edu_out = sections["education"][:25]
    lang_out = sections["languages"][:15]

    all_text = raw
    tech_tokens = _extract_skill_tokens(all_text)

    name = (candidate.get("full_name") or "Unknown").strip()
    city = (candidate.get("city") or "").strip()

    parts: List[str] = []
    parts.append("search_document:")
    parts.append(f"Candidate: {name}" + (f" | City: {city}" if city else ""))

    if tech_tokens:
        parts.append("Tech/Tools (high signal):")
        parts.append(tech_tokens)

    if skills_out:
        parts.append("Skills:")
        parts.extend(skills_out)

    if lic_out:
        parts.append("Licenses/Certificates:")
        parts.extend(lic_out)

    if exp_out:
        parts.append("Experience (compressed):")
        parts.extend(exp_out)

    if edu_out:
        parts.append("Education:")
        parts.extend(edu_out)

    if lang_out:
        parts.append("Languages:")
        parts.extend(lang_out)

    return "\n".join([p for p in parts if p]).strip()


# ---------------- Chunking + embedding ----------------

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
    For similarity search (doc-doc), use search_document on BOTH sides.
    """
    name = (candidate.get("full_name") or "Unknown").strip()
    city = (candidate.get("city") or "").strip()
    headline = (candidate.get("headline") or "").strip()

    header_parts = [f"Candidate: {name}"]
    if city:
        header_parts.append(f"City: {city}")
    if headline:
        header_parts.append(f"Headline: {headline}")
    header = " | ".join(header_parts)

    inputs = []
    for i, ch in enumerate(chunks, start=1):
        inputs.append(f"search_document: {header}\nCV Chunk {i}/{len(chunks)}:\n{ch}")
    return inputs

async def ollama_embed_batch(inputs: List[str]) -> List[List[float]]:
    """
    Calls Ollama /api/embed with batch input.
    /api/embed returns L2-normalized vectors, but after pooling we normalize again.
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

        embs = data.get("embeddings")
        if embs is None:
            single = data.get("embedding")
            if single is not None:
                embs = [single]
            else:
                raise ValueError(f"Unexpected Ollama embed response keys: {list(data.keys())}")

        out = []
        for e in embs:
            if not e or len(e) != DIMS:
                got = len(e) if e else 0
                raise ValueError(f"Invalid embedding dims. Expected {DIMS}, got {got}")
            out.append(e)

        return out

async def build_candidate_vector(candidate: dict, cv_text: str) -> Optional[List[float]]:
    """
    1) Clean CV text
    2) Extract signals (remove boilerplate)
    3) Chunk + /api/embed batch
    4) Mean pool + final L2 normalize
    """
    cv_clean = clean_text_keep_unicode(cv_text)
    if len(cv_clean) < 50:
        return None

    # Signal extraction first
    signal_doc = extract_cv_signals(candidate, cv_clean)

    # If signal extraction got too short, fallback to cleaned raw CV
    embed_source = signal_doc if len(signal_doc) >= MIN_SIGNAL_CHARS else cv_clean

    chunks = chunk_text(embed_source, CHUNK_CHARS, OVERLAP_CHARS, MAX_CHUNKS)
    if not chunks:
        return None

    inputs = build_chunk_inputs(candidate, chunks)
    chunk_vectors = await ollama_embed_batch(inputs)

    pooled = mean_pool(chunk_vectors)
    pooled = l2_normalize(pooled)
    return pooled


# ---------------- CV download + parse ----------------

def download_and_extract_cv(candidate: dict) -> Tuple[str, bool]:
    """
    Returns (cv_text, has_picture_bool)
    For docx/txt: has_picture is False (we only detect images inside PDFs here).
    """
    bucket_path = (candidate.get("cv_bucket_path") or "").strip()
    if not bucket_path:
        return "", False

    is_pdf = bucket_path.lower().endswith(".pdf")
    is_docx = bucket_path.lower().endswith(".docx")

    local_ext = ".pdf" if is_pdf else (".docx" if is_docx else ".txt")

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

    return cv_text, bool(has_picture)


# ---------------- Main enrichment loop ----------------

async def enrich_candidates():
    print("📋 Candidate Vector Generation (Signal extraction + Chunk pooling + /api/embed batch)")

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
            cv_text = c.get("cv_text") or ""
            has_picture = False

            if not cv_text.strip():
                cv_text, has_picture = download_and_extract_cv(c)

            if not cv_text or len(cv_text) < 50:
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

            # Debug preview: store extracted signals first, fallback to raw
            cv_clean = clean_text_keep_unicode(cv_text)
            signal_doc = extract_cv_signals(c, cv_clean)
            debug_source = signal_doc if signal_doc else cv_clean
            debug_preview = debug_source[:MAX_DEBUG_PREVIEW]

            debug_text = (
                f"search_document: Candidate: {(c.get('full_name') or 'Unknown')}\n"
                f"CV Signals Preview:\n{debug_preview}"
            )

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
