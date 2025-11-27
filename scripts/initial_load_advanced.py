# scripts/initial_load_advanced.py
# Advanced version that works around the 2100 pagination limit
# by splitting requests into date ranges

import os
import sys
import requests
import time
# Added timezone to ensure correct timestamp comparisons in DB
from datetime import datetime, timedelta, timezone 
from supabase import create_client, Client
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")

API_BASE_URL = "https://jobsearch.api.jobtechdev.se"
SEARCH_ENDPOINT = f"{API_BASE_URL}/search"

BATCH_SIZE = 100
MAX_OFFSET = 2000  # API hard limit
REQUEST_DELAY = 0.5

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("[ERROR] Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_batch(offset=0, limit=BATCH_SIZE, date_from=None, date_to=None):
    """Fetch a batch of jobs with optional date filtering"""
    headers = {}
    if JOBTECH_API_KEY:
        headers["api-key"] = JOBTECH_API_KEY

    params = {
        "limit": limit,
        "offset": offset,
        "sort": "pubdate-desc"
    }

    # Add date filters if provided
    if date_from:
        params["published-after"] = date_from
    if date_to:
        params["published-before"] = date_to

    try:
        response = requests.get(SEARCH_ENDPOINT, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        total = data.get("total", {}).get("value", 0)
        hits = data.get("hits", [])
        return hits, total
    except Exception as e:
        print(f"[ERROR] API error at offset {offset}: {e}")
        return [], 0

def generate_date_ranges(start_date, end_date, days_per_range=7):
    """Generate date ranges to split the query"""
    ranges = []
    current = start_date

    while current < end_date:
        next_date = min(current + timedelta(days=days_per_range), end_date)
        ranges.append((
            current.strftime("%Y-%m-%d"),
            next_date.strftime("%Y-%m-%d")
        ))
        current = next_date

    return ranges

def cleanup_stale_jobs(run_timestamp):
    """
    Mark & Sweep: Deactivates jobs that were not seen in the current pipeline run.
    Uses a 6-hour safety margin to prevent accidental deactivation during a slow run.
    """
    stale_threshold = run_timestamp - timedelta(hours=6)
    
    print(f"\n🧹 Sweeping for stale jobs (not seen since {stale_threshold.isoformat()})...")

    # Find jobs where last_seen is older than the threshold AND they are still active
    # This query finds jobs that were NOT successfully marked as seen in this run.
    result = supabase.table("job_ads") \
        .update({"is_active": False}) \
        .lt("last_seen", stale_threshold.isoformat()) \
        .eq("is_active", True) \
        .execute()
    
    if hasattr(result, 'count'):
        print(f"   Deactivated {result.count} stale jobs.")
    else:
        print("   Cleanup finished (count not reliably available).")


def fetch_with_date_ranges():
    """Fetch jobs using date range pagination to bypass the 2100 limit"""
    print("[ADVANCED] Using date-range pagination to fetch all jobs...\n")

    # Start from 6 months ago to today
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=180)  # 6 months

    # Generate weekly date ranges
    date_ranges = generate_date_ranges(start_date.replace(tzinfo=None), end_date.replace(tzinfo=None), days_per_range=7)

    print(f"[INFO] Splitting into {len(date_ranges)} date ranges (7 days each)")
    print(f"[INFO] Date range: {start_date.date()} to {end_date.date()}\n")

    all_jobs = []
    total_fetched = 0

    for idx, (date_from, date_to) in enumerate(date_ranges, 1):
        print(f"\n[RANGE {idx}/{len(date_ranges)}] {date_from} to {date_to}")

        # First, check how many jobs exist in this range
        _, range_total = fetch_batch(0, 1, date_from, date_to)
        print(f"  Total jobs in this range: {range_total}")

        if range_total == 0:
            print("  Skipping empty range...")
            continue

        # Fetch up to 2100 jobs from this range
        offset = 0
        range_jobs = []

        while offset <= MAX_OFFSET and offset < range_total:
            hits, _ = fetch_batch(offset, BATCH_SIZE, date_from, date_to)

            if not hits:
                break

            range_jobs.extend(hits)
            print(f"  Offset {offset:4d}: fetched {len(hits)} jobs (range total: {len(range_jobs)})")

            offset += BATCH_SIZE
            time.sleep(REQUEST_DELAY)

        all_jobs.extend(range_jobs)
        total_fetched += len(range_jobs)
        print(f"  Fetched {len(range_jobs)} from this range (cumulative: {total_fetched})")

    print(f"\n[SUCCESS] Total fetched: {len(all_jobs)} jobs")
    return all_jobs

def upsert_jobs(jobs):
    """Laddar upp jobb till Supabase i batcher"""
    if not jobs:
        print("[WARN] No jobs to upload")
        return
    
    # Capture the timestamp when the script RUNS
    run_timestamp = datetime.now(timezone.utc)

    print(f"🛠  Laddar upp {len(jobs)} jobb till Supabase i batcher (Timestamp: {run_timestamp.isoformat()})...")

    batch_size = 100
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]
        job_data_batch = []

        for job in batch:
            # Extract fields safely from JobTechDev Search API response
            workplace = job.get("workplace_address") or {}
            occupation = job.get("occupation") or {}
            description = job.get("description") or {}

            job_data = {
                "id": str(job.get("id")),
                "headline": job.get("headline") or "",
                "description_text": description.get("text") or "",
                "city": workplace.get("municipality"),
                "location": workplace.get("municipality"),
                "published_date": job.get("publication_date"),
                "webpage_url": job.get("webpage_url"),
                "job_category": occupation.get("label"),
                "requires_dl_b": job.get("driving_license_required", False),
                
                # --- NEW FIELD ---
                "application_deadline": job.get("application_deadline"),
                
                # --- INVALIDATION FIX & MARK ---
                # These attributes are reset to force re-processing by downstream scripts,
                # ensuring no stale data is used for matching.
                "embedding": None,          
                "location_lat": None,       
                "location_lon": None,       
                "is_active": True,          # Mark as seen in the current feed
                "last_seen": run_timestamp.isoformat() # Mark with current time
            }
            job_data_batch.append(job_data)

        try:
            supabase.table("job_ads").upsert(job_data_batch, on_conflict='id').execute()
            batch_num = i // batch_size + 1
            total_batches = ((len(jobs) - 1) // batch_size) + 1
            print(f"  Batch {batch_num}/{total_batches} uploaded ({len(job_data_batch)} jobb)")
        except Exception as e:
            print(f"  [ERROR] Upload failed for batch {i // batch_size + 1}: {e}")

    print("✅ Uppladdning till Supabase klar.")
    
    # Run cleanup immediately after successful upsert
    cleanup_stale_jobs(run_timestamp)

if __name__ == "__main__":
    jobs_to_load = fetch_with_date_ranges()
    if jobs_to_load:
        upsert_jobs(jobs_to_load)