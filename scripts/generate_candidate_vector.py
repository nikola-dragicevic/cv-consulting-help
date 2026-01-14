# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import math
import re
import json
import time
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any

from supabase import create_client, Client
from dotenv import load_dotenv

# Import parsers
try:
    from scripts.parse_cv_pdf import extract_text_from_pdf, extract_text_from_docx, summarize_cv_text
except ImportError:
    from parse_cv_pdf import extract_text_from_pdf, extract_text_from_docx, summarize_cv_text

load_dotenv()

# ---------------- Env + Clients ----------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")

# Prefer /api/embed (batch + normalized vectors)
OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL", "http://ollama:11434/api/embed")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = int(os.getenv("DIMS", "768"))

# Paging / runtime controls
BATCH_SIZE = int(os.getenv("CANDIDATE_BATCH_SIZE", "50"))
SLEEP_S = float(os.getenv("CANDIDATE_SLEEP_S", "0.05"))

# Chunking controls (character heuristic)
CHUNK_CHARS = int(os.getenv("CHUNK_CHARS", "1800"))
OVERLAP_CHARS = int(os.getenv("OVERLAP_CHARS", "250"))
MAX_CHUNKS = int(os.getenv("MAX_CHUNKS", "12"))

# Signal extraction tuning
MIN_SIGNAL_CHARS = int(os.getenv("MIN_SIGNAL_CHARS", "350"))   # if extractor yields less -> fallback to cleaned CV
MAX_DEBUG_PREVIEW = int(os.getenv("MAX_DEBUG_PREVIEW", "2000"))

# Optional behavior toggles
FORCE_REBUILD_PROFILE = os.getenv("FORCE_REBUILD_PROFILE", "0") == "1"
FORCE_REBUILD_WISH = os.getenv("FORCE_REBUILD_WISH", "0") == "1"
FORCE_REBUILD_TAGS = os.getenv("FORCE_REBUILD_TAGS", "0") == "1"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent  # /app inside worker container
RESUME_FILE = SCRIPT_DIR / "generate_candidate_vector_resume.json"


# ---------------- Category map loading ----------------

def load_category_map() -> Dict[str, Any]:
    env_map_path = os.getenv("CATEGORY_MAP_PATH")

    candidates: List[Path] = []
    if env_map_path:
        candidates.append(Path(env_map_path))

    candidates += [
        REPO_ROOT / "config" / "category_map.json",
        REPO_ROOT / "src" / "app" / "config" / "category_map.json",
        REPO_ROOT / "app" / "config" / "category_map.json",
    ]

    p = next((x for x in candidates if x.exists()), None)
    if not p:
        # Fallback empty map if file missing, to prevent crash
        print("⚠️ category_map.json not found. Using empty map.")
        return {}

    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        print(f"✅ Loaded category map: {p}")
        return data
    except Exception as e:
        print(f"❌ Failed to parse category map: {e}")
        return {}


CATEGORY_MAP = load_category_map()


def load_occupation_field_relations() -> dict:
    """Load occupation field relationships and multi-field category mappings"""
    env_path = os.getenv("OCCUPATION_FIELD_RELATIONS_PATH")
    candidates: List[Path] = []
    if env_path:
        candidates.append(Path(env_path))

    candidates += [
        REPO_ROOT / "config" / "occupation_field_relations.json",
        REPO_ROOT / "src" / "app" / "config" / "occupation_field_relations.json",
        REPO_ROOT / "app" / "config" / "occupation_field_relations.json",
    ]

    p = next((x for x in candidates if x.exists()), None)
    if not p:
        print("⚠️ occupation_field_relations.json not found. Using empty relations.")
        return {"relations": {}, "multi_field_categories": {}}

    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        print(f"✅ Loaded occupation field relations: {p}")
        return data
    except Exception as e:
        print(f"❌ Failed to parse occupation field relations: {e}")
        return {"relations": {}, "multi_field_categories": {}}


OCCUPATION_FIELD_RELATIONS = load_occupation_field_relations()


def compute_category_tags_from_text(text: str) -> List[str]:
    """
    Candidate-side category tagging:
    We match the category_map rules against a combined text (CV signal doc + wish text).
    Uses word boundary matching to avoid false positives (e.g., "vård" in "lokalvård").
    """
    t = (text or "").lower()
    if not t:
        return []

    tags: List[str] = []
    for tag, rules in CATEGORY_MAP.items():
        fields = [x.lower() for x in rules.get("fields", [])]
        groups = [x.lower() for x in rules.get("groups", [])]
        role_contains = [x.lower() for x in rules.get("roles_contains", [])]

        hit = False
        # For fields and groups, use substring matching (broader matching)
        if fields and any(f in t for f in fields):
            hit = True
        if groups and any(g in t for g in groups):
            hit = True
        # For role_contains, use word boundary matching to avoid false positives
        if role_contains:
            for rc in role_contains:
                # Use regex word boundaries to match complete words only
                pattern = r'\b' + re.escape(rc) + r'\b'
                if re.search(pattern, t):
                    hit = True
                    break

        if hit:
            tags.append(tag)

    return sorted(set(tags))


# Mapping from category tags to occupation fields (must match job_ads.occupation_field_label)
CATEGORY_TO_OCCUPATION_FIELD = {
    "IT": "Data/IT",
    "Software Development": "Data/IT",
    "Engineering / Tech": "Tekniskt arbete",
    "Automation / Industrial": "Industriell tillverkning",
    "Construction / Infrastructure": "Bygg och anläggning",
    "Logistics / Operations": "Transport",
    "Management": "Chefer och verksamhetsledare",
    "HR": "Administration, ekonomi, juridik",
    "Finance": "Administration, ekonomi, juridik",
    "Legal": "Administration, ekonomi, juridik",
    "Administration": "Administration, ekonomi, juridik",
    "Sales / Marketing": "Försäljning, inköp, marknadsföring",
    "Healthcare": "Hälso- och sjukvård",
    "Education": "Pedagogiskt arbete",
    "Service / Hospitality": "Hotell, restaurang, storhushåll",
    "Security": "Säkerhetsarbete",
    "Social Work": "Socialt arbete",
    "Culture / Media": "Kultur, media, design",
    "Nature / Agriculture": "Naturbruk",
}

TAG_PRIORITY = [
    "Software Development",
    "IT",
    "Engineering / Tech",
    "Automation / Industrial",
    "Construction / Infrastructure",
    "Logistics / Operations",
    "Finance",
    "Legal",
    "HR",
    "Sales / Marketing",
    "Healthcare",
    "Education",
    "Service / Hospitality",
    "Security",
    "Social Work",
    "Culture / Media",
    "Management",
    "Administration",
    "Nature / Agriculture",
]


def compute_primary_occupation_field(category_tags: List[str]) -> Optional[str]:
    """
    DEPRECATED: Use compute_occupation_fields instead.
    Kept for backwards compatibility. Returns first field from compute_occupation_fields.
    """
    fields = compute_occupation_fields(category_tags, include_related=False)
    return fields[0] if fields else None


def compute_occupation_fields(category_tags: List[str], include_related: bool = True) -> List[str]:
    """
    Given category tags, determine all applicable occupation fields.
    Supports multiple occupation fields per candidate for better job matching.

    Args:
        category_tags: List of category tags from the candidate
        include_related: Whether to include related occupation fields

    Returns:
        List of occupation field labels (e.g., ["Hotell, restaurang, storhushåll", "Sanering och renhållning"])
    """
    if not category_tags:
        return []

    tag_set = set(category_tags)
    occupation_fields = set()

    # Check for multi-field categories first (e.g., Service/Hospitality → multiple fields)
    multi_field_map = OCCUPATION_FIELD_RELATIONS.get("multi_field_categories", {})
    for tag in category_tags:
        if tag in multi_field_map and multi_field_map[tag]:
            occupation_fields.update(multi_field_map[tag])

    # If we found multi-field matches, use those
    if occupation_fields:
        result = sorted(list(occupation_fields))
        if include_related:
            # Add related fields for each primary field
            related = set()
            relations = OCCUPATION_FIELD_RELATIONS.get("relations", {})
            for field in result:
                if field in relations:
                    related.update(relations[field].get("related", []))
            if related:
                result.extend(sorted(list(related)))
        return result

    # Otherwise, use single-field mapping with priority
    # IT/Software takes precedence (most common use case)
    if "Software Development" in tag_set or "IT" in tag_set:
        occupation_fields.add("Data/IT")
    else:
        # Find highest priority tag
        for priority_tag in TAG_PRIORITY:
            if priority_tag in tag_set:
                field = CATEGORY_TO_OCCUPATION_FIELD.get(priority_tag)
                if field:
                    occupation_fields.add(field)
                    break

        # Fallback: first tag alphabetically
        if not occupation_fields:
            first_tag = sorted(category_tags)[0]
            field = CATEGORY_TO_OCCUPATION_FIELD.get(first_tag)
            if field:
                occupation_fields.add(field)

    result = sorted(list(occupation_fields))

    # Add related fields if requested
    if include_related and result:
        related = set()
        relations = OCCUPATION_FIELD_RELATIONS.get("relations", {})
        for field in result:
            if field in relations:
                related.update(relations[field].get("related", []))
        if related:
            result.extend(sorted(list(related)))

    return result


# ---------------- Resume cursor helpers ----------------

def load_resume_cursor() -> Optional[str]:
    if RESUME_FILE.exists():
        try:
            data = json.loads(RESUME_FILE.read_text(encoding="utf-8"))
            return data.get("last_id")
        except Exception:
            return None
    return None


def save_resume_cursor(last_id: str) -> None:
    RESUME_FILE.write_text(json.dumps({"last_id": last_id}), encoding="utf-8")


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
    x = re.sub(r"^[=\-•\s]+|[=\-•\s:]+$", "", x)
    return x


def _is_heading(line: str) -> Optional[str]:
    norm = _normalize_heading(line)
    if not norm:
        return None
    if norm in _HEADING_MAP:
        return _HEADING_MAP[norm]
    if re.fullmatch(r"[a-zåäö\s]{3,40}", norm) and norm in _HEADING_MAP:
        return _HEADING_MAP[norm]
    return None


def _looks_like_contact_line(line: str) -> bool:
    l = line.lower()
    if "@" in line and "." in line:
        return True
    if re.search(r"(\+46|0\d{1,3})[\s\-]?\d{2,4}[\s\-]?\d{2,4}[\s\-]?\d{0,4}", line):
        return True
    contact_keywords = [
        "telefon", "mobil", "e-post", "email", "mail",
        "adress", "postnummer", "zipcode",
        "linkedin", "github",
        "personnummer",
    ]
    if any(k in l for k in contact_keywords):
        return True
    if re.search(r"\b(vägen|väg|gatan|gata|street|st\.|box)\b", l):
        return True
    return False


def _drop_contact_block(lines: List[str]) -> List[str]:
    if not lines:
        return lines

    top = lines[:25]
    top_low = " ".join([x.lower() for x in top])
    likely_contact = ("kontakt" in top_low) or (sum(1 for x in top if _looks_like_contact_line(x)) >= 3)
    if not likely_contact:
        return lines

    for i, ln in enumerate(lines):
        h = _is_heading(ln)
        if h in ("experience", "skills", "education", "licenses", "languages"):
            return lines[i:]
    return lines[15:]


def _extract_skill_tokens(all_text: str) -> str:
    if not all_text:
        return ""

    tokens = set()

    for m in re.finditer(r"\b[A-ZÅÄÖ]{2,10}\b", all_text):
        tokens.add(m.group(0))

    for m in re.finditer(r"\b[A-Za-z]{1,6}[-/ ]?\d{2,5}(?:[-/]\d{2,5})?\b", all_text):
        tokens.add(m.group(0))

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

    out = sorted(tokens)[:80]
    return ", ".join(out)


def extract_cv_signals(candidate: dict, cv_text: str) -> str:
    raw = clean_text_keep_unicode(cv_text)
    if not raw:
        return ""

    lines = raw.splitlines()
    lines = _drop_contact_block(lines)

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
            if h == "references":
                current = "references"
                continue
            current = h
            continue

        if _looks_like_contact_line(ln):
            continue

        if current == "references":
            continue

        if current is None:
            if re.search(r"\b(PLC|SCADA|HMI|WMS|SQL|Python|Java|C#|Siemens|automation|automatis|control|warehouse|lager|truck)\b", ln, flags=re.I):
                sections["skills"].append(ln)
            elif re.search(r"\b(20\d{2}|19\d{2})\b", ln):
                sections["experience"].append(ln)
            continue

        if current in sections:
            sections[current].append(ln)

    exp_out: List[str] = []
    for ln in sections["experience"]:
        if len(ln) > 240:
            ln = ln[:240].rstrip()
        if re.search(r"\b(20\d{2}|19\d{2})\b", ln) or ln.startswith(("•", "-", "●")):
            exp_out.append(ln)
        elif re.search(r"\b(technician|engineer|operator|specialist|automation|automatis|process|warehouse|lager)\b", ln, flags=re.I):
            exp_out.append(ln)

    exp_out = exp_out[:60]
    skills_out = sections["skills"][:60]
    lic_out = sections["licenses"][:30]
    edu_out = sections["education"][:25]
    lang_out = sections["languages"][:15]

    tech_tokens = _extract_skill_tokens(raw)

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
    name = (candidate.get("full_name") or "Unknown").strip()
    city = (candidate.get("city") or "").strip()

    header_parts = [f"Candidate: {name}"]
    if city:
        header_parts.append(f"City: {city}")
    header = " | ".join(header_parts)

    inputs = []
    for i, ch in enumerate(chunks, start=1):
        inputs.append(f"search_document: {header}\nCV Chunk {i}/{len(chunks)}:\n{ch}")
    return inputs


async def ollama_embed_batch(inputs: List[str]) -> List[List[float]]:
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

        out: List[List[float]] = []
        for e in embs:
            if not e or len(e) != DIMS:
                got = len(e) if e else 0
                raise ValueError(f"Invalid embedding dims. Expected {DIMS}, got {got}")
            out.append(e)

        return out


async def embed_text_to_vector(candidate: dict, source_text: str) -> Optional[List[float]]:
    """
    Your production embedding pipeline:
      - clean
      - extract signals
      - fallback to raw if too short
      - chunk
      - /api/embed batch
      - mean pool
      - L2 normalize
    """
    cv_clean = clean_text_keep_unicode(source_text)
    if len(cv_clean) < 50:
        return None

    signal_doc = extract_cv_signals(candidate, cv_clean)
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


# ---------------- Core: process one candidate ----------------

def build_candidate_debug_text(candidate: dict, cv_text: str) -> str:
    cv_clean = clean_text_keep_unicode(cv_text)
    signal_doc = extract_cv_signals(candidate, cv_clean)
    debug_source = signal_doc if signal_doc else cv_clean
    debug_preview = debug_source[:MAX_DEBUG_PREVIEW]

    name = (candidate.get("full_name") or "Unknown").strip()
    return (
        f"search_document: Candidate: {name}\n"
        f"CV Signals Preview:\n{debug_preview}"
    ).strip()


def should_build_profile(c: dict) -> bool:
    if FORCE_REBUILD_PROFILE:
        return True
    return c.get("profile_vector") is None


def should_build_wish(c: dict) -> bool:
    if FORCE_REBUILD_WISH:
        return bool((c.get("wish_text_vector") or "").strip())
    return (c.get("wish_vector") is None) and bool((c.get("wish_text_vector") or "").strip())


def should_build_tags(c: dict) -> bool:
    if FORCE_REBUILD_TAGS:
        return True
    return c.get("category_tags") is None


def combine_for_tags(candidate_text_vector: str, wish_text_vector: str) -> str:
    # Tags should be derived from the same human-readable sources we store
    combined = "\n".join([candidate_text_vector or "", wish_text_vector or ""]).strip()
    return combined


# ---------------- Main enrichment loop (paged + resumable) ----------------

async def enrich_candidates():
    print("📋 Candidate enrichment: profile_vector + wish_vector + category_tags")
    print(f"   model={EMBEDDING_MODEL} dims={DIMS} embed_url={OLLAMA_EMBED_URL}")
    print(f"   batch_size={BATCH_SIZE} force_profile={FORCE_REBUILD_PROFILE} force_wish={FORCE_REBUILD_WISH} force_tags={FORCE_REBUILD_TAGS}")

    last_id = load_resume_cursor()
    if last_id:
        print(f"📌 Resuming after last_id={last_id}")

    total_seen = 0
    total_updated = 0

    while True:
        q = (
            supabase.table("candidate_profiles")
            .select(
                "id,user_id,email,full_name,city,"
                "cv_bucket_path,has_picture,"
                "candidate_text_vector,profile_vector,"
                "wish_text_vector,wish_vector,"
                "category_tags"
            )
            .order("id", desc=False)
            .limit(BATCH_SIZE)
        )
        if last_id:
            q = q.gt("id", last_id)

        resp = q.execute()
        rows = resp.data or []
        if not rows:
            print("✅ Done. No more rows.")
            break

        total_seen += len(rows)
        last_id = rows[-1].get("id")
        if last_id:
            save_resume_cursor(last_id)

        for c in rows:
            cid = c.get("id")
            email = c.get("email") or c.get("user_id") or "unknown"
            print(f"\n👤 Processing: {email} (id={cid})")

            try:
                need_profile = should_build_profile(c)
                need_wish = should_build_wish(c)
                need_tags = should_build_tags(c)

                if not (need_profile or need_wish or need_tags):
                    print("✅ Already complete (profile_vector + wish_vector (if any) + category_tags).")
                    continue

                patch: Dict[str, Any] = {"has_picture": bool(c.get("has_picture") or False)}

                # ----- Build / refresh CV text -----
                cv_text = (c.get("cv_text") or "").strip()
                has_picture = bool(c.get("has_picture") or False)

                if need_profile or need_tags:
                    if not cv_text:
                        cv_text, has_picture = download_and_extract_cv(c)
                        patch["has_picture"] = bool(has_picture)

                    if not cv_text or len(cv_text) < 50:
                        # can't build profile vector; still can build wish vector + tags from wish only
                        print("⏭️ No usable CV text (possibly scanned/image-only).")

                    else:
                        # always keep candidate_text_vector fresh if we are building profile OR tags are missing
                        debug_text = build_candidate_debug_text(c, cv_text)
                        patch["candidate_text_vector"] = debug_text

                        if need_profile:
                            vec = await embed_text_to_vector(c, cv_text)
                            if vec is None:
                                print("⏭️ Skipping profile_vector: vector build failed (no chunks).")
                            else:
                                patch["profile_vector"] = vec
                                print(f"✅ profile_vector ready ({len(vec)} dims)")

                # ----- Build wish vector (from wish_text_vector) -----
                if need_wish:
                    wish_text = (c.get("wish_text_vector") or "").strip()
                    if not wish_text:
                        print("ℹ️ No wish_text_vector present; skipping wish_vector.")
                    else:
                        # Reuse same embedding pipeline (signals/sections works fine even for wish text)
                        vec_w = await embed_text_to_vector(c, wish_text)
                        if vec_w is None:
                            print("⏭️ Skipping wish_vector: vector build failed.")
                        else:
                            patch["wish_vector"] = vec_w
                            print(f"✅ wish_vector ready ({len(vec_w)} dims)")

                # ----- Compute category tags whenever we write vectors OR tags missing -----
                # Use candidate_text_vector (signal doc) + wish_text_vector for best signal.
                if need_tags or ("profile_vector" in patch) or ("wish_vector" in patch):
                    candidate_text_vector = patch.get("candidate_text_vector") or c.get("candidate_text_vector") or ""
                    wish_text_vector = c.get("wish_text_vector") or ""
                    combined = combine_for_tags(candidate_text_vector, wish_text_vector)
                    tags = compute_category_tags_from_text(combined)
                    patch["category_tags"] = tags
                    print(f"🏷️ category_tags = {tags}")

                    # ----- Compute occupation fields from tags (supports multiple fields) -----
                    # Set include_related=False to only use direct mappings
                    # Set include_related=True to also include related occupation fields
                    occupation_fields = compute_occupation_fields(tags, include_related=False)
                    if occupation_fields:
                        patch["primary_occupation_field"] = occupation_fields
                        print(f"🎯 primary_occupation_field = {occupation_fields}")

                # ----- Persist patch -----
                # Only update if patch has something meaningful beyond has_picture
                meaningful = [k for k in patch.keys() if k not in ("has_picture",)]
                if not meaningful and patch.get("has_picture") == bool(c.get("has_picture") or False):
                    print("ℹ️ Nothing to update.")
                    continue

                supabase.table("candidate_profiles").update(patch).eq("id", cid).execute()
                total_updated += 1
                print(f"✅ Updated candidate {email}")

            except Exception as e:
                print(f"❌ Failed for {email}: {e}")

            if SLEEP_S > 0:
                await asyncio.sleep(SLEEP_S)

    print("\n📊 Summary")
    print(f"   total_seen={total_seen}")
    print(f"   total_updated_rows={total_updated}")
    print(f"   resume_file={RESUME_FILE} (delete if finished)")

# ✅ EXPORT ALIAS (This fixes the ImportError in service.py)
build_candidate_vector = embed_text_to_vector

if __name__ == "__main__":
    asyncio.run(enrich_candidates())