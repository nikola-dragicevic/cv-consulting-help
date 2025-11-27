# scripts/initial_load.py
# Hämtar jobbannonser från JobTechDev Search API med batchning och pagination

import os
import sys
import requests
import time
from supabase import create_client, Client
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

# --- Konfiguration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")  # Registrera på apirequest.jobtechdev.se

# JobTechDev Search API (2025)
API_BASE_URL = "https://jobsearch.api.jobtechdev.se"
SEARCH_ENDPOINT = f"{API_BASE_URL}/search"

# Pagination settings
BATCH_SIZE = 100  # Max per request
MAX_OFFSET = 2000  # API limit
REQUEST_DELAY = 0.5  # Seconds between requests (be nice to the API)

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Saknar Supabase miljövariabler. Avbryter.")
    exit()

if not JOBTECH_API_KEY:
    print("⚠️  JOBTECH_API_KEY saknas. API kan begränsa requests.")
    print("   Registrera en nyckel på: https://apirequest.jobtechdev.se")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_batch(offset=0, limit=BATCH_SIZE):
    """Hämtar en batch jobb från API:et"""
    headers = {}
    if JOBTECH_API_KEY:
        headers["api-key"] = JOBTECH_API_KEY

    params = {
        "limit": limit,
        "offset": offset,
        "published-after": "2024-01-01",  # Endast senaste jobben
        "sort": "pubdate-desc"
    }

    try:
        response = requests.get(SEARCH_ENDPOINT, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()

        total = data.get("total", {}).get("value", 0)
        hits = data.get("hits", [])

        return hits, total

    except requests.exceptions.RequestException as e:
        print(f"❌ API-fel vid offset {offset}: {e}")
        return [], 0

def fetch_and_process_jobs():
    """Hämtar alla jobb med pagination"""
    print(f"📥 Hämtar jobbannonser från JobTechDev Search API...")
    print(f"   Endpoint: {SEARCH_ENDPOINT}")

    all_jobs = []
    offset = 0
    total_available = None

    while offset <= MAX_OFFSET:
        print(f"   📦 Hämtar batch: offset={offset}, limit={BATCH_SIZE}")

        hits, total = fetch_batch(offset, BATCH_SIZE)

        if total_available is None:
            total_available = min(total, (MAX_OFFSET + BATCH_SIZE))
            print(f"   📊 Totalt {total} jobb tillgängliga, hämtar max {total_available}")

        if not hits:
            print(f"   ✅ Inga fler jobb att hämta vid offset {offset}")
            break

        all_jobs.extend(hits)
        print(f"   ✓ Hämtade {len(hits)} jobb (totalt: {len(all_jobs)})")

        offset += BATCH_SIZE

        # Check if we've reached the end
        if len(hits) < BATCH_SIZE or len(all_jobs) >= total_available:
            break

        # Rate limiting
        time.sleep(REQUEST_DELAY)

    print(f"✅ Totalt hämtade {len(all_jobs)} jobbannonser")
    return all_jobs

def upsert_jobs(jobs):
    """Laddar upp jobb till Supabase i batcher"""
    if not jobs:
        print("Inga jobb att ladda in.")
        return

    print(f"🛠  Laddar upp {len(jobs)} jobb till Supabase i batcher...")

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
                "city": workplace.get("municipality"),  # Note: API uses 'municipality' not 'city'
                "location": workplace.get("municipality"),
                "published_date": job.get("publication_date"),
                "webpage_url": job.get("webpage_url"),
                "job_category": occupation.get("label"),
                "requires_dl_b": job.get("driving_license_required", False),
                
                # --- CHANGE APPLIED HERE ---
                # This is the "invalidation" step.
                # By setting these to None, we flag them for re-processing
                # by the enrich_jobs.py and geocode-jobs.ts scripts.
                # This fixes the "stale data" problem.
                "embedding": None,
                "location_lat": None,
                "location_lon": None
                # --- END OF CHANGE ---
            }
            job_data_batch.append(job_data)

        try:
            supabase.table("job_ads").upsert(job_data_batch, on_conflict='id').execute()
            batch_num = i // batch_size + 1
            total_batches = ((len(jobs) - 1) // batch_size) + 1
            print(f"  ✓ Batch {batch_num}/{total_batches} klar ({len(job_data_batch)} jobb)")
        except Exception as e:
            print(f"  ❌ Fel vid uppladdning av batch {i // batch_size + 1}: {e}")

    print("✅ Uppladdning till Supabase klar.")

if __name__ == "__main__":
    jobs_to_load = fetch_and_process_jobs()
    if jobs_to_load:
        upsert_jobs(jobs_to_load)