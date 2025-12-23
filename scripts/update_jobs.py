# scripts/update_jobs.py
import os
import requests
import json
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
# Using the search API to fetch changes/new jobs
API_BASE_URL = "https://jobsearch.api.jobtechdev.se/search"
TIMESTAMP_FILE = "last_run.json"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def load_last_run_date():
    if os.path.exists(TIMESTAMP_FILE):
        try:
            with open(TIMESTAMP_FILE, "r") as f:
                data = json.load(f)
                return data.get("last_run_date")
        except:
            pass
    # Fallback: Yesterday
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")

def save_last_run_date():
    with open(TIMESTAMP_FILE, "w") as f:
        # Save current time for next run
        json.dump({"last_run_date": datetime.now().strftime("%Y-%m-%dT%H:%M:%S")}, f)

def delete_expired_jobs():
    """
    Deletes jobs from Supabase where application_deadline has passed.
    This prevents the database from overfilling with dead jobs.
    """
    print("🧹 Cleaning up expired jobs...")
    try:
        # Note: Supabase JS/Python client delete usage
        now_iso = datetime.now().isoformat()
        
        # We delete where application_deadline < NOW()
        response = supabase.table("job_ads")\
            .delete()\
            .lt("application_deadline", now_iso)\
            .execute()
            
        # If response.data is available, we can count deleted rows
        deleted_count = len(response.data) if response.data else 0
        print(f"✅ Deleted {deleted_count} expired jobs.")
        
    except Exception as e:
        print(f"❌ Error deleting expired jobs: {e}")

def fetch_and_upsert_new_jobs():
    last_run = load_last_run_date()
    print(f"📡 Fetching jobs published after: {last_run}")
    
    offset = 0
    batch_size = 100
    total_added = 0
    
    while True:
        params = {
            "published-after": last_run,
            "limit": batch_size,
            "offset": offset,
            "sort": "pubdate-asc" # Oldest first, so if we crash we resume naturally
        }
        
        try:
            response = requests.get(API_BASE_URL, params=params)
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
                description = job.get("description") or {}

                # ✅ Extract Lat/Lon if provided by API
                lat = None
                lon = None
                if workplace.get("coordinates"):
                    coords = workplace.get("coordinates")
                    # API usually gives [lon, lat] for GeoJSON compatibility
                    if len(coords) == 2:
                        lon = coords[0]
                        lat = coords[1]

                job_data = {
                    "id": str(job.get("id")),
                    "headline": job.get("headline"),
                    "description_text": description.get("text"),
                    "city": workplace.get("municipality"),
                    "location": workplace.get("municipality"),
                    "published_date": job.get("publication_date"),
                    "application_deadline": job.get("application_deadline"), # Important for cleanup
                    "webpage_url": job.get("webpage_url"),
                    "job_category": occupation.get("label"),
                    "requires_dl_b": job.get("driving_license_required", False),
                    "location_lat": lat,
                    "location_lon": lon,
                    "source_snapshot": job
                }
                job_batch.append(job_data)

            # Upsert batch
            supabase.table("job_ads").upsert(job_batch, on_conflict='id').execute()
            total_added += len(job_batch)
            offset += batch_size
            
            # Safety break for massive updates
            if offset >= 2000:
                print("⚠️ Hit offset limit (2000). Only first 2000 new jobs fetched.")
                break
                
        except Exception as e:
            print(f"❌ API Error: {e}")
            break

    print(f"✅ Upserted {total_added} new jobs.")
    save_last_run_date()

def run_job_update():
    delete_expired_jobs()
    fetch_and_upsert_new_jobs()

if __name__ == "__main__":
    run_job_update()