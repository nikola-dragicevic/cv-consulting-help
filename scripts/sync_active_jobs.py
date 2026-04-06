# scripts/sync_active_jobs.py
import os
import requests
import time
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
API_SEARCH_URL = "https://jobsearch.api.jobtechdev.se/search"
WINDOW_HOURS = int(os.getenv("STALE_SYNC_WINDOW_HOURS", "4"))
FETCH_TIMEOUT_SECONDS = int(os.getenv("STALE_SYNC_FETCH_TIMEOUT_SECONDS", "30"))
MAX_FETCH_RETRIES = int(os.getenv("STALE_SYNC_MAX_FETCH_RETRIES", "3"))
DB_UPDATE_BATCH_SIZE = int(os.getenv("STALE_SYNC_DB_UPDATE_BATCH_SIZE", "200"))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_ids_for_window(start_iso: str, end_iso: str) -> set:
    """
    Fetches all job IDs published within a specific time window.
    """
    ids = set()
    offset = 0
    batch_size = 100
    
    while True:
        try:
            params = {
                "published-after": start_iso,
                "published-before": end_iso,
                "limit": batch_size,
                "offset": offset,
                "fields": "id"
            }

            resp = None
            for attempt in range(MAX_FETCH_RETRIES):
                try:
                    resp = requests.get(API_SEARCH_URL, params=params, timeout=FETCH_TIMEOUT_SECONDS)
                    break
                except requests.exceptions.ReadTimeout:
                    wait_s = 2 * (attempt + 1)
                    print(
                        f"      ⏳ Read timeout for {start_iso} -> {end_iso} "
                        f"(attempt {attempt + 1}/{MAX_FETCH_RETRIES}). Sleeping {wait_s}s..."
                    )
                    time.sleep(wait_s)

            if resp is None:
                print(f"      ❌ Giving up on window after {MAX_FETCH_RETRIES} timeouts: {start_iso} -> {end_iso}")
                break
            
            if resp.status_code == 429:
                print("      ⏳ Rate limited. Sleeping 5s...")
                time.sleep(5)
                continue
                
            resp.raise_for_status()
            data = resp.json()
            
            hits = data.get("hits", [])
            if not hits:
                break
                
            for job in hits:
                ids.add(str(job.get("id")))
                
            offset += batch_size
            
            # Safety break: If a 6-hour window has > 2000 jobs, we log it.
            # (Extremely rare, but prevents infinite loops)
            if offset >= 2000:
                print(f"      ⚠️ Warning: Hit 2000 limit between {start_iso} and {end_iso}.")
                break
                
        except Exception as e:
            print(f"      ❌ Error fetching window: {e}")
            break
            
    return ids

def fetch_all_active_ids_history():
    """
    Iterates back 120 days in small chunks to reduce API timeouts and keep pages bounded.
    """
    print(f"📡 Starting Full ID Scan ({WINDOW_HOURS}-Hour Window Strategy)...")
    active_ids = set()
    
    # Go back 120 days
    DAYS_BACK = 120
    chunks_per_day = max(1, 24 // WINDOW_HOURS)
    TOTAL_CHUNKS = DAYS_BACK * chunks_per_day
    
    now = datetime.now()
    
    for i in range(TOTAL_CHUNKS):
        # Calculate time window
        # We move backwards: End is (now - i*window), Start is (End - window)
        end_dt = now - timedelta(hours=i * WINDOW_HOURS)
        start_dt = end_dt - timedelta(hours=WINDOW_HOURS)
        
        start_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
        end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
        
        # Fetch that window
        window_ids = fetch_ids_for_window(start_iso, end_iso)
        active_ids.update(window_ids)
        
        # Log progress once per day of scanned history
        if i % chunks_per_day == 0:
            print(f"   📅 Scanned {start_iso[:10]} (+{len(window_ids)} in last chunk) | Total Found: {len(active_ids)}")
            
        # Be nice to the API
        time.sleep(0.05)

    print(f"✅ History Scan Complete. Found {len(active_ids)} total active jobs.")
    return active_ids

def clean_stale_jobs():
    # 1. Get Source of Truth
    active_api_ids = fetch_all_active_ids_history()
    
    # Safety Check: Require at least 10k jobs to prevent accidental wipes
    if not active_api_ids or len(active_api_ids) < 10000:
        print(f"⚠️ Safety Halt: API returned too few jobs ({len(active_api_ids) if active_api_ids else 0}).")
        print("   This might mean the API is down or blocked.")
        print("   Preventing deletion to protect database.")
        return

    # 2. Get All DB IDs
    print("💾 Fetching all Job IDs from Database...")
    db_ids = set()
    start = 0
    limit = 10000 
    
    while True:
        try:
            res = supabase.table("job_ads").select("id").range(start, start + limit - 1).execute()
            rows = res.data
            if not rows:
                break
            for row in rows:
                db_ids.add(str(row['id']))
            start += limit
            if len(db_ids) % 10000 == 0:
                print(f"   ... DB loaded {len(db_ids)} jobs...")
        except Exception as e:
            print(f"❌ DB Read Error: {e}")
            return

    print(f"✅ DB Scan Complete. Total Jobs in DB: {len(db_ids)}")

    # 3. Calculate Stale Jobs
    stale_ids = db_ids - active_api_ids
    print(f"🧹 Found {len(stale_ids)} stale jobs to mark inactive.")

    # 4. Batch deactivate
    if stale_ids:
        stale_list = list(stale_ids)
        batch_size = DB_UPDATE_BATCH_SIZE
        total_updated = 0
        now_iso = datetime.now(timezone.utc).isoformat()
        
        for i in range(0, len(stale_list), batch_size):
            batch = stale_list[i : i + batch_size]
            print(f"   💤 Marking batch {i} - {i+len(batch)} inactive...")
            try:
                supabase.table("job_ads").update({
                    "is_active": False,
                    "source_inactivated_at": now_iso,
                }).in_("id", batch).eq("is_active", True).execute()
                total_updated += len(batch)
                time.sleep(0.2)
            except Exception as e:
                print(f"   ❌ Inactivation failed for batch: {e}")

        print(f"✨ Cleanup Finished. Marked {total_updated} stale jobs inactive.")
    else:
        print("✨ Database is already perfectly synced.")

if __name__ == "__main__":
    clean_stale_jobs()
