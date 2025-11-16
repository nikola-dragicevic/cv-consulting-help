# scripts/check_db_count.py
# Check what's actually in the database

import os
import sys
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

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("[ERROR] Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def check_db():
    print("[DB CHECK] Checking job_ads table...\n")

    # Total count
    result = supabase.table("job_ads").select("id", count="exact").execute()
    total = result.count
    print(f"Total jobs in database: {total}")

    # With embeddings
    result_embedded = supabase.table("job_ads").select("id", count="exact").is_("embedding", "null").execute()
    not_embedded = result_embedded.count
    embedded = total - not_embedded
    print(f"Jobs with embeddings: {embedded}")
    print(f"Jobs without embeddings: {not_embedded}")

    # With geocoding
    result_geocoded = supabase.table("job_ads").select("id", count="exact").is_("location_lat", "null").execute()
    not_geocoded = result_geocoded.count
    geocoded = total - not_geocoded
    print(f"Jobs with geocoding: {geocoded}")
    print(f"Jobs without geocoding: {not_geocoded}")

    # Latest job date
    result_latest = supabase.table("job_ads").select("published_date").order("published_date", desc=True).limit(1).execute()
    if result_latest.data:
        latest = result_latest.data[0]["published_date"]
        print(f"\nLatest job date: {latest}")

    # Oldest job date
    result_oldest = supabase.table("job_ads").select("published_date").order("published_date", desc=False).limit(1).execute()
    if result_oldest.data:
        oldest = result_oldest.data[0]["published_date"]
        print(f"Oldest job date: {oldest}")

if __name__ == "__main__":
    check_db()
