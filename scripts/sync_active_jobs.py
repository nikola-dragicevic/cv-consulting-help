# scripts/sync_active_jobs.py
import os
import requests
import time
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
API_BASE_URL = "https://jobsearch.api.jobtechdev.se/search"

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_all_active_ids():
    """
    Fetches ALL active Job IDs from the API.
    Uses pagination and requests ONLY the 'id' field to keep it fast.
    """
    print("📡 Starting Full ID Scan from API...")
    active_ids = set()
    offset = 0
    batch_size = 2000 # Max out limit if possible, usually 100 is limit for detailed, but we check headers
    
    # Standard limit is often 100, let's stick to safe iteration or standard search
    # API docs say default limit 10, max 100. We will loop.
    # PRO TIP: For huge datasets, some APIs support stream or exports. 
    # Since we have ~50k, 100 per page = 500 requests. That's manageable.
    
    batch_size = 100 
    
    while True:
        try:
            # We only need the ID to verify existence
            response = requests.get(
                API_BASE_URL,
                params={
                    "q": "*",           # Empty search to get everything
                    "limit": batch_size,
                    "offset": offset,
                    "sort": "pubdate-desc",
                    "fields": "id"      # ✅ CRITICAL: Only fetch ID to save bandwidth
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            hits = data.get("hits", [])
            
            if not hits:
                break
                
            for job in hits:
                active_ids.add(str(job.get("id")))
            
            offset += batch_size
            
            # Progress marker every 5000 jobs
            if len(active_ids) % 5000 == 0:
                print(f"   ... Found {len(active_ids)} active jobs so far...")

            # Safety break if API returns total results and we met it
            total_positions = data.get("total", {}).get("value", 0)
            if offset >= total_positions:
                break
                
            # Rate limiting sleep
            time.sleep(0.1)
            
        except Exception as e:
            print(f"❌ Error during ID fetch: {e}")
            # If we fail halfway, we shouldn't delete anything to be safe
            return None

    print(f"✅ API Scan Complete. Total Active Jobs in Source: {len(active_ids)}")
    return active_ids

def clean_stale_jobs():
    # 1. Get Source of Truth
    active_api_ids = fetch_all_active_ids()
    
    if not active_api_ids or len(active_api_ids) < 1000:
        print("⚠️ Safety Halt: API returned too few jobs (<1000). Preventing mass deletion.")
        return

    # 2. Get All DB IDs
    print("💾 Fetching all Job IDs from Database...")
    
    # Supabase/PostgREST limit is usually 1000, need to paginate db fetching too
    db_ids = set()
    start = 0
    limit = 5000 # Supabase python client can handle larger chunks usually
    
    while True:
        res = supabase.table("job_ads").select("id").range(start, start + limit - 1).execute()
        rows = res.data
        if not rows:
            break
            
        for row in rows:
            db_ids.add(str(row['id']))
            
        start += limit
        print(f"   ... DB loaded {len(db_ids)} jobs...")

    print(f"✅ DB Scan Complete. Total Jobs in DB: {len(db_ids)}")

    # 3. Calculate Stale Jobs (In DB but NOT in API)
    stale_ids = db_ids - active_api_ids
    print(f"🧹 Found {len(stale_ids)} stale jobs to delete.")

    # 4. Batch Delete
    if stale_ids:
        stale_list = list(stale_ids)
        batch_size = 1000
        
        for i in range(0, len(stale_list), batch_size):
            batch = stale_list[i : i + batch_size]
            print(f"   🗑️ Deleting batch {i} - {i+len(batch)}...")
            try:
                supabase.table("job_ads").delete().in_("id", batch).execute()
            except Exception as e:
                print(f"   ❌ Delete failed for batch: {e}")

    print("✨ Sync Complete. Database is now 1:1 with API.")

if __name__ == "__main__":
    clean_stale_jobs()