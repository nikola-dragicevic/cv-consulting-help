#!/usr/bin/env python3
"""
Backfill deterministic requirements into job_requirements_normalized.

Design:
- Primary source: description text (text_formatted/text)
- Secondary source: structured must_have/nice_to_have if present
- No LLM dependency in this pass
"""

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

SCRIPT_DIR = Path(__file__).resolve().parent
RESUME_FILE = SCRIPT_DIR / "extract_job_requirements_resume.json"

BATCH_SIZE = int(os.getenv("REQ_PARSE_BATCH_SIZE", "200"))
SLEEP_S = float(os.getenv("REQ_PARSE_SLEEP_S", "0.05"))
ONLY_ACTIVE = os.getenv("REQ_PARSE_ONLY_ACTIVE", "true").lower() == "true"
MODE = os.getenv("REQ_PARSE_MODE", "missing").lower()  # missing|all
MAX_TEXT_CHARS = int(os.getenv("REQ_PARSE_MAX_TEXT_CHARS", "12000"))
INPUT_JSON_PATH = os.getenv("REQ_PARSE_INPUT_JSON", "").strip()
OFFLINE_FALLBACK_JSON = os.getenv("REQ_PARSE_OFFLINE_FALLBACK_JSON", "").strip()
OUTPUT_JSON_PATH = os.getenv("REQ_PARSE_OUTPUT_JSON", "scripts/parsed_requirements_output.json").strip()

# Heading classifiers.
MUST_HEADINGS = [
    r"^krav\b",
    r"^kvalifikationer\b",
    r"^vi\s+soker\b",
    r"^vi\s+soeker\b",
    r"^du\s+har\b",
    r"^your\s+qualifications\b",
    r"^requirements\b",
]
NICE_HEADINGS = [
    r"^meriterande\b",
    r"^det\s+ar\s+meriterande\b",
    r"^nice\s+to\s+have\b",
    r"^preferred\b",
]

LICENSE_PATTERNS = [
    (r"\bb[-\s]?korkort\b", "B-korkort"),
    (r"\bb[-\s]?kor[kc]ort\b", "B-korkort"),
    (r"\bkorkort\b", "Korkort"),
    (r"\btruckkort\b", "Truckkort"),
    (r"\btraverskort\b", "Traverskort"),
]

CERT_PATTERNS = [
    (r"\bheta\s+arbeten\b", "Heta arbeten"),
    (r"\bsaker\s+vatten\b", "Saker vatten"),
    (r"\besa\b", "ESA"),
    (r"\bfallskydd\b", "Fallskydd"),
    (r"\bscada\b", "SCADA"),
    (r"\bplc\b", "PLC"),
    (r"\bhaccp\b", "HACCP"),
    (r"\biso\s*9001\b", "ISO 9001"),
    (r"\biso\s*14001\b", "ISO 14001"),
]

EDU_PATTERNS = [
    (r"\bgymnasieutbildning\b", "Gymnasieutbildning"),
    (r"\byrkeshogskola\b", "Yrkeshogskola"),
    (r"\bhogskoleutbildning\b", "Hogskoleutbildning"),
    (r"\buniversitetsutbildning\b", "Universitetsutbildning"),
    (r"\bcivilingenjor\b", "Civilingenjor"),
    (r"\bsjukskotersk(e|a)\b", "Sjukskoterskeutbildning"),
]

LANG_PATTERNS = [
    (r"\bsvenska\b", "svenska"),
    (r"\bengelska\b", "engelska"),
    (r"\benglish\b", "engelska"),
]

SKILL_KEYWORDS = [
    "excel", "sap", "sql", "python", "java", "javascript", "typescript",
    "react", "next.js", "node", "docker", "kubernetes", "linux",
    "wms", "erp", "scada", "plc", "autocad", "solidworks", "cad",
    "svets", "cnc", "lean", "kanban", "scrum",
]

YEARS_RE = re.compile(r"\b(\d{1,2})\s*\+?\s*ar\b", re.I)


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


def clear_resume_cursor() -> None:
    if RESUME_FILE.exists():
        RESUME_FILE.unlink()


def safe_json(obj: Any) -> Dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if isinstance(obj, str):
        try:
            x = json.loads(obj)
            return x if isinstance(x, dict) else {}
        except Exception:
            return {}
    return {}


def get_jobs_list(data: Any) -> List[Dict[str, Any]]:
    """
    Defensive helper for local tests where payload may be list or wrapped.
    Not used in DB fetch, but useful for extension and tests.
    """
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("hits", "jobs", "data"):
            if isinstance(data.get(k), list):
                return [x for x in data.get(k) if isinstance(x, dict)]
    return []


def normalize_text(s: str) -> str:
    s = (s or "").replace("\x00", "")
    s = s.replace("\r", "\n")
    lines = [ln.strip() for ln in s.splitlines()]
    return "\n".join([ln for ln in lines if ln]).strip()


def split_sentences(text: str) -> List[str]:
    raw = re.split(r"(?<=[\.\!\?])\s+|\n", text)
    return [x.strip(" -•\t") for x in raw if x and x.strip(" -•\t")]


def extract_labeled_values(items: Any) -> List[str]:
    out: List[str] = []
    if isinstance(items, list):
        for it in items:
            if isinstance(it, dict):
                v = (it.get("label") or it.get("value") or "").strip()
                if v:
                    out.append(v)
            elif isinstance(it, str):
                v = it.strip()
                if v:
                    out.append(v)
    return sorted(set(out))


def classify_lines(text: str) -> Tuple[List[str], List[str], List[str]]:
    """
    Returns (must_lines, nice_lines, neutral_lines)
    """
    must_lines: List[str] = []
    nice_lines: List[str] = []
    neutral_lines: List[str] = []

    section = "neutral"
    must_rx = [re.compile(p, re.I) for p in MUST_HEADINGS]
    nice_rx = [re.compile(p, re.I) for p in NICE_HEADINGS]

    for line in text.splitlines():
        ln = line.strip()
        if not ln:
            continue

        lower = ln.lower()
        if any(rx.search(lower) for rx in must_rx):
            section = "must"
            continue
        if any(rx.search(lower) for rx in nice_rx):
            section = "nice"
            continue

        if section == "must":
            must_lines.append(ln)
        elif section == "nice":
            nice_lines.append(ln)
        else:
            neutral_lines.append(ln)

    return must_lines, nice_lines, neutral_lines


def scan_patterns(lines: List[str]) -> Dict[str, Any]:
    txt = "\n".join(lines).lower()

    licenses = sorted({label for pattern, label in LICENSE_PATTERNS if re.search(pattern, txt, re.I)})
    certs = sorted({label for pattern, label in CERT_PATTERNS if re.search(pattern, txt, re.I)})
    edu = sorted({label for pattern, label in EDU_PATTERNS if re.search(pattern, txt, re.I)})
    langs = sorted({label for pattern, label in LANG_PATTERNS if re.search(pattern, txt, re.I)})
    skills = sorted({kw for kw in SKILL_KEYWORDS if re.search(r"\b" + re.escape(kw) + r"\b", txt, re.I)})

    years = [int(m.group(1)) for m in YEARS_RE.finditer(txt)]
    min_years = max(years) if years else None

    return {
        "licenses": licenses,
        "certs": certs,
        "education": edu,
        "languages": langs,
        "skills": skills,
        "min_years": min_years,
    }


def to_language_json(values: List[str], strength: str) -> List[Dict[str, Any]]:
    return [{"language": v, "level": None, "strength": strength} for v in sorted(set(values))]


def parse_requirements(row: Dict[str, Any]) -> Dict[str, Any]:
    snap = safe_json(row.get("source_snapshot"))

    desc_obj = snap.get("description") if isinstance(snap.get("description"), dict) else {}
    desc_struct = (desc_obj.get("text_formatted") or desc_obj.get("text") or "").strip()
    desc_fallback = (row.get("description_text") or "").strip()
    full_text = normalize_text((desc_struct or desc_fallback)[:MAX_TEXT_CHARS])

    must_struct = snap.get("must_have") if isinstance(snap.get("must_have"), dict) else {}
    nice_struct = snap.get("nice_to_have") if isinstance(snap.get("nice_to_have"), dict) else {}

    # Structured extraction (if available).
    must_skills = extract_labeled_values(must_struct.get("skills"))
    nice_skills = extract_labeled_values(nice_struct.get("skills"))
    must_licenses = extract_labeled_values(must_struct.get("driving_license"))
    nice_licenses = extract_labeled_values(nice_struct.get("driving_license"))
    must_edu = extract_labeled_values(must_struct.get("education"))
    nice_edu = extract_labeled_values(nice_struct.get("education"))

    must_lang_struct = extract_labeled_values(must_struct.get("languages"))
    nice_lang_struct = extract_labeled_values(nice_struct.get("languages"))

    # Text-based extraction.
    must_lines, nice_lines, neutral_lines = classify_lines(full_text)
    must_scan = scan_patterns(must_lines + neutral_lines)
    nice_scan = scan_patterns(nice_lines)

    # Merge structured + text signals.
    must_skills = sorted(set(must_skills + must_scan["skills"]))
    nice_skills = sorted(set(nice_skills + nice_scan["skills"]))

    must_licenses = sorted(set(must_licenses + must_scan["licenses"]))
    nice_licenses = sorted(set(nice_licenses + nice_scan["licenses"]))

    must_certs = sorted(set(must_scan["certs"]))
    nice_certs = sorted(set(nice_scan["certs"]))

    must_edu = sorted(set(must_edu + must_scan["education"]))
    nice_edu = sorted(set(nice_edu + nice_scan["education"]))

    must_langs = sorted(set(must_lang_struct + must_scan["languages"]))
    nice_langs = sorted(set(nice_lang_struct + nice_scan["languages"]))

    hard_constraints: Dict[str, Any] = {}
    if row.get("driving_license_required") is True or row.get("requires_dl_b") is True:
        hard_constraints["driving_license_required"] = True
    if "B-korkort" in must_licenses or "Korkort" in must_licenses:
        hard_constraints["required_license"] = "korkort"

    must_exp = {}
    if must_scan["min_years"] is not None:
        must_exp["min_years"] = must_scan["min_years"]

    nice_exp = {}
    if nice_scan["min_years"] is not None:
        nice_exp["min_years"] = nice_scan["min_years"]

    missing_flags: List[str] = []
    if not extract_labeled_values(must_struct.get("skills")):
        missing_flags.append("structured_must_have_skills_empty")
    if not extract_labeled_values(must_struct.get("education")):
        missing_flags.append("structured_must_have_education_empty")
    if not extract_labeled_values(nice_struct.get("skills")):
        missing_flags.append("structured_nice_to_have_skills_empty")
    if not full_text:
        missing_flags.append("description_text_missing")

    signal_count = sum([
        len(must_skills),
        len(must_licenses),
        len(must_certs),
        len(must_langs),
        len(must_edu),
        1 if must_exp else 0,
        len(nice_skills),
        len(nice_licenses),
        len(nice_certs),
    ])
    parse_confidence = min(1.0, 0.2 + 0.1 * signal_count)
    if not full_text:
        parse_confidence = min(parse_confidence, 0.2)

    return {
        "requirements_version": 1,
        "must_have_skills": must_skills,
        "must_have_licenses": must_licenses,
        "must_have_certifications": must_certs,
        "must_have_languages": to_language_json(must_langs, "must"),
        "must_have_education": must_edu,
        "must_have_experience": must_exp,
        "nice_to_have_skills": nice_skills,
        "nice_to_have_licenses": nice_licenses,
        "nice_to_have_certifications": nice_certs,
        "nice_to_have_languages": to_language_json(nice_langs, "nice"),
        "nice_to_have_education": nice_edu,
        "nice_to_have_experience": nice_exp,
        "hard_constraints": hard_constraints,
        "parse_confidence": parse_confidence,
        "parse_sources": {
            "structured_present": bool(must_struct or nice_struct),
            "description_used": bool(full_text),
            "must_lines_count": len(must_lines),
            "nice_lines_count": len(nice_lines),
        },
        "missing_extraction_flags": sorted(set(missing_flags)),
        "extracted_at": "now()",
    }


def fetch_batch(last_id: Optional[str]) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    q = (
        supabase.table("job_ads")
        .select("id, source_snapshot, description_text, requires_dl_b, removed")
        .order("id", desc=False)
        .limit(BATCH_SIZE)
    )
    if last_id:
        q = q.gt("id", last_id)
    if ONLY_ACTIVE:
        q = q.eq("removed", False)
    rows = q.execute().data or []

    if MODE == "missing":
        # Filter out rows already parsed in normalized table (lightweight in-memory for this batch).
        ids = [r["id"] for r in rows if r.get("id")]
        if not ids:
            return []
        existing = (
            supabase.table("job_requirements_normalized")
            .select("job_id")
            .in_("job_id", ids)
            .execute()
            .data
            or []
        )
        done = {r["job_id"] for r in existing if r.get("job_id")}
        rows = [r for r in rows if r.get("id") not in done]

    return rows


def upsert_batch(rows: List[Dict[str, Any]]) -> None:
    supabase = get_supabase_client()
    payload = []
    for row in rows:
        job_id = row.get("id")
        if not job_id:
            continue
        parsed = parse_requirements(row)
        parsed["job_id"] = job_id
        # "now()" cannot be inserted as SQL function via JSON payload in postgrest.
        parsed.pop("extracted_at", None)
        payload.append(parsed)

    if not payload:
        return

    supabase.table("job_requirements_normalized").upsert(payload, on_conflict="job_id").execute()


def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def run_local_file(path: str) -> None:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"Input file not found: {path}")

    raw = json.loads(p.read_text(encoding="utf-8"))
    jobs = get_jobs_list(raw)
    if not jobs:
        raise SystemExit("No jobs found in input file. Expected list or dict with hits/jobs/data.")

    print(f"Offline parse mode: {path}")
    print(f"Jobs to parse: {len(jobs)}")

    rows = []
    for j in jobs:
        desc = j.get("description") if isinstance(j.get("description"), dict) else {}
        rows.append({
            "id": j.get("id"),
            "source_snapshot": j,
            "description_text": desc.get("text") or "",
            "driving_license_required": j.get("driving_license_required", False),
            "is_active": not bool(j.get("removed", False)),
        })

    parsed = [parse_requirements(r) for r in rows if r.get("id")]
    total = len(parsed)
    if total == 0:
        print("No parseable rows.")
        return

    with_must_skills = sum(1 for x in parsed if x["must_have_skills"])
    with_must_licenses = sum(1 for x in parsed if x["must_have_licenses"])
    with_must_langs = sum(1 for x in parsed if x["must_have_languages"])
    avg_conf = sum(float(x["parse_confidence"]) for x in parsed) / total

    print("--- Summary ---")
    print(f"with must_have_skills: {with_must_skills}/{total}")
    print(f"with must_have_licenses: {with_must_licenses}/{total}")
    print(f"with must_have_languages: {with_must_langs}/{total}")
    print(f"avg parse_confidence: {avg_conf:.3f}")

    example = next((x for x in parsed if x["must_have_skills"] or x["must_have_licenses"]), parsed[0])
    print("--- Example Parsed Record ---")
    print(json.dumps(example, ensure_ascii=True, indent=2)[:2500])

    # Save full parsed output for inspection and downstream testing.
    out_path = Path(OUTPUT_JSON_PATH)
    out_payload = []
    for row, rec in zip(rows, parsed):
        out_payload.append({
            "job_id": row.get("id"),
            **rec,
        })
    out_path.write_text(json.dumps(out_payload, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"Saved parsed output to: {out_path}")


def run() -> None:
    if INPUT_JSON_PATH:
        run_local_file(INPUT_JSON_PATH)
        return

    last_id = load_resume_cursor()
    total_seen = 0
    total_upserted = 0

    print("Starting requirement extraction backfill")
    print(f"MODE={MODE} ONLY_ACTIVE={ONLY_ACTIVE} BATCH_SIZE={BATCH_SIZE}")
    if last_id:
        print(f"Resuming after id={last_id}")

    while True:
        try:
            batch = fetch_batch(last_id)
        except httpx.ConnectError as e:
            print(f"DB connection failed: {e}")
            if OFFLINE_FALLBACK_JSON and Path(OFFLINE_FALLBACK_JSON).exists():
                print(f"Falling back to offline file mode: {OFFLINE_FALLBACK_JSON}")
                run_local_file(OFFLINE_FALLBACK_JSON)
                return
            print("Offline fallback disabled. Exiting with DB connection error.")
            raise
        if not batch:
            print("Done. No more rows.")
            clear_resume_cursor()
            break

        upsert_batch(batch)
        total_upserted += len(batch)
        total_seen += len(batch)

        last_id = batch[-1]["id"]
        save_resume_cursor(last_id)

        print(f"Processed batch={len(batch)} total={total_seen}")
        time.sleep(SLEEP_S)

    print(f"Summary: total_seen={total_seen} total_upserted={total_upserted}")


if __name__ == "__main__":
    run()
