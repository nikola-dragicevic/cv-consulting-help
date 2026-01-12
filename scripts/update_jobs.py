# scripts/update_jobs.py
import os
import json
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")

# Using the search API to fetch changes/new jobs
API_BASE_URL = "https://jobsearch.api.jobtechdev.se/search"

# Store timestamp next to this script so it works no matter cwd
SCRIPT_DIR = Path(__file__).resolve().parent
TIMESTAMP_FILE = SCRIPT_DIR / "last_run.json"

# config/category_map.json lives at repo root/config/
REPO_ROOT = SCRIPT_DIR.parent
CATEGORY_MAP_PATH = REPO_ROOT / "config" / "category_map.json"

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

if not CATEGORY_MAP_PATH.exists():
    raise SystemExit(f"❌ Missing category map file: {CATEGORY_MAP_PATH}")

CATEGORY_MAP = json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))


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


def load_last_run_date() -> str:
    if TIMESTAMP_FILE.exists():
        try:
            data = json.loads(TIMESTAMP_FILE.read_text(encoding="utf-8"))
            if data.get("last_run_date"):
                return data["last_run_date"]
        except Exception:
            pass

    # Fallback: Yesterday (UTC) to avoid missing new jobs due to timezone drift
    return (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")


def save_last_run_date() -> None:
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    TIMESTAMP_FILE.write_text(json.dumps({"last_run_date": now_str}), encoding="utf-8")


def delete_expired_jobs() -> None:
    """
    Deletes jobs from Supabase where application_deadline has passed.
    """
    print("🧹 Cleaning up expired jobs...")
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        response = (
            supabase.table("job_ads")
            .delete()
            .lt("application_deadline", now_iso)
            .execute()
        )
        deleted_count = len(response.data) if getattr(response, "data", None) else 0
        print(f"✅ Deleted {deleted_count} expired jobs.")
    except Exception as e:
        print(f"❌ Error deleting expired jobs: {e}")


def fetch_and_upsert_new_jobs() -> None:
    last_run = load_last_run_date()
    print(f"📡 Fetching jobs published after: {last_run}")

    offset = 0
    batch_size = 100
    total_upserted = 0

    headers = {"api-key": JOBTECH_API_KEY} if JOBTECH_API_KEY else {}

    while True:
        params = {
            "published-after": last_run,
            "limit": batch_size,
            "offset": offset,
            "sort": "pubdate-asc",  # Oldest first; safer resume
        }

        try:
            response = requests.get(API_BASE_URL, params=params, headers=headers, timeout=30)
            if response.status_code == 429:
                print("⏳ Rate limit (429). Waiting 5s...")
                import time
                time.sleep(5)
                continue

            response.raise_for_status()
            data = response.json()
            hits = data.get("hits", [])

            if not hits:
                break

            print(f"   Processing batch of {len(hits)} jobs...")

            job_batch = []
            for job in hits:
                workplace = job.get("workplace_address") or {}
                occupation = job.get("occupation") or {}
                occupation_group = job.get("occupation_group") or {}
                occupation_field = job.get("occupation_field") or {}
                description = job.get("description") or {}

                # Geo coords are typically [lon, lat]
                lat = None
                lon = None
                coords = workplace.get("coordinates")
                if isinstance(coords, list) and len(coords) == 2:
                    lon, lat = coords[0], coords[1]

                field_label = occupation_field.get("label") or ""
                group_label = occupation_group.get("label") or ""
                role_label = occupation.get("label") or ""

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
                    "job_category": role_label,  # keep for backwards compat

                    "requires_dl_b": job.get("driving_license_required", False),
                    "location_lat": lat,
                    "location_lon": lon,

                    "source_snapshot": job,

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
                }

                job_batch.append(job_data)

            supabase.table("job_ads").upsert(job_batch, on_conflict="id").execute()
            total_upserted += len(job_batch)

            offset += batch_size

            # Safety break
            if offset >= 2000:
                print("⚠️ Hit offset limit (2000). Only first 2000 new jobs fetched.")
                break

        except Exception as e:
            print(f"❌ API Error: {e}")
            break

    print(f"✅ Upserted {total_upserted} new jobs.")
    save_last_run_date()


def run_job_update() -> None:
    delete_expired_jobs()
    fetch_and_upsert_new_jobs()


if __name__ == "__main__":
    run_job_update()
