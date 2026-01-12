# scripts/initial_load.py
import os
import sys
import json
import requests
import time
from datetime import datetime, timedelta
from pathlib import Path

from supabase import create_client, Client
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")

API_BASE_URL = "https://jobsearch.api.jobtechdev.se"
SEARCH_ENDPOINT = f"{API_BASE_URL}/search"

DAYS_TO_FETCH = int(os.getenv("DAYS_TO_FETCH", "120"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "100"))
REQUEST_DELAY = float(os.getenv("REQUEST_DELAY", "0.2"))

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
CATEGORY_MAP_PATH = REPO_ROOT / "config" / "category_map.json"

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Missing Supabase env vars. Aborting.")
    raise SystemExit(1)

if not CATEGORY_MAP_PATH.exists():
    raise SystemExit(f"❌ Missing category map file: {CATEGORY_MAP_PATH}")

CATEGORY_MAP = json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def compute_category_tags(field: str, group: str, role: str) -> list[str]:
    field_l = (field or "").lower()
    group_l = (group or "").lower()
    role_l = (role or "").lower()

    tags: list[str] = []
    for tag, rules in CATEGORY_MAP.items():
        fields = [x.lower() for x in rules.get("fields", [])]
        groups = [x.lower() for x in rules.get("groups", [])]
        role_contains = [x.lower() for x in rules.get("roles_contains", [])]

        hit = False
        if fields and any(f in field_l for f in fields):
            hit = True
        if groups and any(g in group_l for g in groups):
            hit = True
        if role_contains and any(rc in role_l for rc in role_contains):
            hit = True

        if hit:
            tags.append(tag)

    return sorted(set(tags))


def fetch_jobs_for_time_range(pub_after: str, pub_before: str):
    hits_for_chunk = []
    offset = 0
    headers = {"api-key": JOBTECH_API_KEY} if JOBTECH_API_KEY else {}

    while True:
        params = {
            "published-after": pub_after,
            "published-before": pub_before,
            "limit": BATCH_SIZE,
            "offset": offset,
            "sort": "pubdate-desc",
        }

        try:
            response = requests.get(SEARCH_ENDPOINT, params=params, headers=headers, timeout=30)
            if response.status_code == 429:
                print(" ⏳ Rate limit! Waiting 5s...")
                time.sleep(5)
                continue

            response.raise_for_status()
            data = response.json()
            hits = data.get("hits", [])

            if not hits:
                break

            hits_for_chunk.extend(hits)
            offset += BATCH_SIZE

            if len(hits) < BATCH_SIZE:
                break

            if offset >= 2000:
                print(f" (⚠️ Max offset reached for interval {pub_after})", end="")
                break

            time.sleep(REQUEST_DELAY)

        except Exception as e:
            print(f" ❌ API error: {e}")
            break

    return hits_for_chunk


def fetch_jobs_for_date(date_string: str):
    all_hits = []
    time_chunks = [
        ("00:00:00", "03:59:59"),
        ("04:00:00", "07:59:59"),
        ("08:00:00", "11:59:59"),
        ("12:00:00", "15:59:59"),
        ("16:00:00", "19:59:59"),
        ("20:00:00", "23:59:59"),
    ]

    print(f"   📅 Processing {date_string} ", end="", flush=True)

    for start_time, end_time in time_chunks:
        pub_after = f"{date_string}T{start_time}"
        pub_before = f"{date_string}T{end_time}"
        chunk_hits = fetch_jobs_for_time_range(pub_after, pub_before)
        all_hits.extend(chunk_hits)
        print(".", end="", flush=True)

    print(f" -> {len(all_hits)} jobs.")
    return all_hits


def upsert_jobs(jobs):
    if not jobs:
        return 0

    batch_size = 100
    upserted_count = 0

    for i in range(0, len(jobs), batch_size):
        batch = jobs[i : i + batch_size]
        job_data_batch = []

        for job in batch:
            workplace = job.get("workplace_address") or {}
            occupation = job.get("occupation") or {}
            occupation_group = job.get("occupation_group") or {}
            occupation_field = job.get("occupation_field") or {}
            description = job.get("description") or {}

            # Coordinates may be [lon, lat]
            lat = None
            lon = None
            coords = workplace.get("coordinates")
            if isinstance(coords, list) and len(coords) == 2:
                lon, lat = coords[0], coords[1]

            role_label = occupation.get("label") or ""
            field_label = occupation_field.get("label") or ""
            group_label = occupation_group.get("label") or ""

            category_tags = compute_category_tags(field_label, group_label, role_label)

            job_data = {
                "id": str(job.get("id")),
                "headline": job.get("headline"),
                "description_text": description.get("text"),
                "city": workplace.get("municipality"),
                "location": workplace.get("municipality"),
                "published_date": job.get("publication_date"),
                "application_deadline": job.get("application_deadline"),
                "webpage_url": job.get("webpage_url"),
                "job_category": role_label,
                "requires_dl_b": job.get("driving_license_required", False),
                "location_lat": lat,
                "location_lon": lon,

                # Taxonomy fields
                "occupation_field_label": occupation_field.get("label"),
                "occupation_field_concept_id": occupation_field.get("concept_id"),
                "occupation_field_legacy_ams_taxonomy_id": occupation_field.get("legacy_ams_taxonomy_id"),

                "occupation_group_label": occupation_group.get("label"),
                "occupation_group_concept_id": occupation_group.get("concept_id"),
                "occupation_group_legacy_ams_taxonomy_id": occupation_group.get("legacy_ams_taxonomy_id"),

                "occupation_label": occupation.get("label"),
                "occupation_concept_id": occupation.get("concept_id"),
                "occupation_legacy_ams_taxonomy_id": occupation.get("legacy_ams_taxonomy_id"),

                # Control layer
                "category_tags": category_tags,

                # ✅ FORCE re-enrichment (keeps your pipeline behavior)
                "embedding": None,
                "embedding_text": None,
                "embedding_error": None,
                "embedding_updated_at": None,
                "parse_debug": None,

                # ✅ store the full payload ONCE (you had this twice before)
                "source_snapshot": job,
            }

            job_data_batch.append(job_data)

        try:
            supabase.table("job_ads").upsert(job_data_batch, on_conflict="id").execute()
            upserted_count += len(job_data_batch)
        except Exception as e:
            print(f"      ❌ DB error: {e}")

    return upserted_count


def run_full_load():
    print(f"🚀 Full load: last {DAYS_TO_FETCH} days")
    total_jobs = 0
    start_date = datetime.now() - timedelta(days=DAYS_TO_FETCH)

    for i in range(DAYS_TO_FETCH + 1):
