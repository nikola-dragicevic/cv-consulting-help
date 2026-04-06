# scripts/update_jobs.py
import os
import json
import requests
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from supabase import create_client, Client
from dotenv import load_dotenv

try:
    from scripts.job_contact_extractor import extract_job_contact_data
except ModuleNotFoundError:
    from job_contact_extractor import extract_job_contact_data

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")

# Using the search API to fetch changes/new jobs
API_BASE_URL = "https://jobsearch.api.jobtechdev.se/search"
FETCH_TIMEOUT_SECONDS = int(os.getenv("JOB_FETCH_TIMEOUT_SECONDS", "45"))
MAX_FETCH_RETRIES = int(os.getenv("JOB_FETCH_MAX_RETRIES", "3"))
RATE_LIMIT_SLEEP_SECONDS = int(os.getenv("JOB_FETCH_RATE_LIMIT_SLEEP_SECONDS", "5"))
EXPIRED_DEACTIVATION_BATCH_SIZE = int(os.getenv("JOB_EXPIRED_DEACTIVATION_BATCH_SIZE", "200"))

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


def deactivate_expired_jobs() -> None:
    """
    Marks jobs inactive where application_deadline has passed.
    Safer than hard deletion because ads may still be useful for audit/history.
    """
    print("🧹 Marking expired jobs as inactive...")
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        response = (
            supabase.table("job_ads")
            .select("id")
            .lt("application_deadline", now_iso)
            .eq("is_active", True)
            .limit(5000)
            .execute()
        )
        rows = response.data or []
        if not rows:
            print("✅ No expired active jobs needed inactivation.")
            return

        expired_ids = [row["id"] for row in rows if row.get("id")]
        total_updated = 0
        for i in range(0, len(expired_ids), EXPIRED_DEACTIVATION_BATCH_SIZE):
            batch = expired_ids[i:i + EXPIRED_DEACTIVATION_BATCH_SIZE]
            (
                supabase.table("job_ads")
                .update({
                    "is_active": False,
                    "source_inactivated_at": now_iso,
                })
                .in_("id", batch)
                .eq("is_active", True)
                .execute()
            )
            total_updated += len(batch)

        print(f"✅ Marked {total_updated} expired jobs as inactive.")
    except Exception as e:
        print(f"❌ Error marking expired jobs inactive: {e}")


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
            response = None
            for attempt in range(MAX_FETCH_RETRIES):
                try:
                    response = requests.get(
                        API_BASE_URL,
                        params=params,
                        headers=headers,
                        timeout=FETCH_TIMEOUT_SECONDS,
                    )
                    break
                except requests.exceptions.ReadTimeout:
                    wait_s = 2 * (attempt + 1)
                    print(
                        f"⏳ Read timeout while fetching offset={offset} "
                        f"(attempt {attempt + 1}/{MAX_FETCH_RETRIES}). Sleeping {wait_s}s..."
                    )
                    time.sleep(wait_s)

            if response is None:
                print(f"❌ Giving up on fetch for offset={offset} after {MAX_FETCH_RETRIES} timeouts.")
                break

            if response.status_code == 429:
                print(f"⏳ Rate limit (429). Waiting {RATE_LIMIT_SLEEP_SECONDS}s...")
                time.sleep(RATE_LIMIT_SLEEP_SECONDS)
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
                    "is_active": True,
                    "last_seen_at": datetime.now(timezone.utc).isoformat(),
                    "source_inactivated_at": None,
                }

                contact_data = extract_job_contact_data(
                    description_text=description.get("text"),
                    webpage_url=job.get("webpage_url"),
                    source_snapshot=job,
                )

                job_data.update({
                    "contact_email": contact_data["contact_email"],
                    "has_contact_email": contact_data["has_contact_email"],
                    "contact_email_source": contact_data["contact_email_source"],
                    "application_url": contact_data["application_url"],
                    "application_url_source": contact_data["application_url_source"],
                    "application_channel": contact_data["application_channel"],
                    "application_channel_reason": contact_data["application_channel_reason"],
                })

                job_batch.append(job_data)

            supabase.table("job_ads").upsert(job_batch, on_conflict="id").execute()
            total_upserted += len(job_batch)

            offset += batch_size

            # Safety break
            if offset >= 2000:
                print("⚠️ Hit offset limit (2000). Only first 2000 new jobs fetched.")
                break

        except requests.exceptions.RequestException as e:
            print(f"❌ API request error at offset={offset}: {e}")
            break
        except Exception as e:
            print(f"❌ Unexpected API error at offset={offset}: {e}")
            break

    print(f"✅ Upserted {total_upserted} new jobs.")
    save_last_run_date()


def refresh_missing_contact_fields() -> None:
    repair_limit = int(os.getenv("JOB_CONTACT_REPAIR_LIMIT", "250"))
    if repair_limit <= 0:
        print("ℹ️ Skipping contact-field repair pass (JOB_CONTACT_REPAIR_LIMIT <= 0).")
        return

    print(f"🔧 Repairing up to {repair_limit} older jobs missing contact classification...")
    try:
        response = (
            supabase.table("job_ads")
            .select("id, description_text, webpage_url, source_snapshot")
            .is_("application_channel", "null")
            .limit(repair_limit)
            .execute()
        )
    except Exception as e:
        print(f"❌ Failed to fetch jobs for repair pass: {e}")
        return

    rows = response.data or []
    if not rows:
        print("✅ No older jobs missing contact classification.")
        return

    updates = []
    direct_email_count = 0
    external_apply_count = 0

    for row in rows:
        contact = extract_job_contact_data(
            description_text=row.get("description_text"),
            webpage_url=row.get("webpage_url"),
            source_snapshot=row.get("source_snapshot"),
        )
        if contact["has_contact_email"]:
            direct_email_count += 1
        elif contact["application_channel"] == "external_apply":
            external_apply_count += 1

        updates.append(
            {
                "id": row["id"],
                "contact_email": contact["contact_email"],
                "has_contact_email": contact["has_contact_email"],
                "contact_email_source": contact["contact_email_source"],
                "application_url": contact["application_url"],
                "application_url_source": contact["application_url_source"],
                "application_channel": contact["application_channel"],
                "application_channel_reason": contact["application_channel_reason"],
            }
        )

    try:
        supabase.table("job_ads").upsert(updates, on_conflict="id").execute()
        print(
            f"✅ Repaired {len(updates)} older jobs. direct_email={direct_email_count}, external_apply={external_apply_count}"
        )
    except Exception as e:
        print(f"❌ Failed to save repair-pass updates: {e}")


def run_job_update() -> None:
    deactivate_expired_jobs()
    fetch_and_upsert_new_jobs()
    refresh_missing_contact_fields()


if __name__ == "__main__":
    run_job_update()
