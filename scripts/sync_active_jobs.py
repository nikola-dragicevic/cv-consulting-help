# scripts/sync_active_jobs.py
import os
import requests
import time
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
API_SEARCH_URL = "https://jobsearch.api.jobtechdev.se/search"

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
            
            resp = requests.get(API_SEARCH_URL, params=params, timeout=10)
            
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
    Iterates back 120 days in 6-hour chunks to ensure no batch exceeds 2000 jobs.
    """
    print("📡 Starting Full ID Scan (6-Hour Window Strategy)...")
    active_ids = set()
    
    # Go back 120 days
    DAYS_BACK = 120
    # 4 chunks per day (6 hours each)
    TOTAL_CHUNKS = DAYS_BACK * 4
    
    now = datetime.now()
    
    for i in range(TOTAL_CHUNKS):
        # Calculate time window
        # We move backwards: End is (now - i*6h), Start is (End - 6h)
        end_dt = now - timedelta(hours=i*6)
        start_dt = end_dt - timedelta(hours=6)
        
        start_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
        end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
        
        # Fetch that window
        window_ids = fetch_ids_for_window(start_iso, end_iso)
        active_ids.update(window_ids)
        
        # Log progress every 4 chunks (every "day" of data)
        if i % 4 == 0:
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
    print(f"🧹 Found {len(stale_ids)} stale jobs to delete.")

    # 4. Batch Delete
    if stale_ids:
        stale_list = list(stale_ids)
        batch_size = 1000
        total_deleted = 0
        
        for i in range(0, len(stale_list), batch_size):
            batch = stale_list[i : i + batch_size]
            print(f"   🗑️ Deleting batch {i} - {i+len(batch)}...")
            try:
                supabase.table("job_ads").delete().in_("id", batch).execute()
                total_deleted += len(batch)
                time.sleep(0.5)
            except Exception as e:
                print(f"   ❌ Delete failed for batch: {e}")

        print(f"✨ Cleanup Finished. Deleted {total_deleted} stale jobs.")
    else:
        print("✨ Database is already perfectly synced.")

if __name__ == "__main__":
    clean_stale_jobs()