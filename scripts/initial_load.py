# scripts/initial_load.py
import os
import sys
import requests
import time
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY") 

API_BASE_URL = "https://jobsearch.api.jobtechdev.se"
SEARCH_ENDPOINT = f"{API_BASE_URL}/search"

# Settings
DAYS_TO_FETCH = 120  # Öka denna om du vill hämta äldre jobb
BATCH_SIZE = 100
REQUEST_DELAY = 0.2

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Saknar Supabase miljövariabler. Avbryter.")
    exit()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_jobs_for_time_range(pub_after, pub_before):
    """
    Hämtar jobb för ett specifikt tidsintervall.
    """
    hits_for_chunk = []
    offset = 0
    
    while True:
        headers = {"api-key": JOBTECH_API_KEY} if JOBTECH_API_KEY else {}
        params = {
            "published-after": pub_after,
            "published-before": pub_before,
            "limit": BATCH_SIZE,
            "offset": offset,
            "sort": "pubdate-desc"
        }

        try:
            response = requests.get(SEARCH_ENDPOINT, params=params, headers=headers)
            if response.status_code == 429:
                print(" ⏳ Rate limit! Väntar 5s...")
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
                print(f" (⚠️ Max offset nådd för intervall {pub_after})", end="")
                break

            time.sleep(REQUEST_DELAY)

        except Exception as e:
            print(f" ❌ API Fel: {e}")
            break
            
    return hits_for_chunk

def fetch_jobs_for_date(date_string):
    """
    Delar upp dagen i 4-timmarsblock för att komma runt 2000-gränsen.
    """
    all_hits = []
    
    # 6 tidsblock per dag för att maximera täckningen
    time_chunks = [
        ("00:00:00", "03:59:59"),
        ("04:00:00", "07:59:59"),
        ("08:00:00", "11:59:59"),
        ("12:00:00", "15:59:59"),
        ("16:00:00", "19:59:59"),
        ("20:00:00", "23:59:59")
    ]

    print(f"   📅 Bearbetar {date_string} ", end="", flush=True)
    
    for start_time, end_time in time_chunks:
        pub_after = f"{date_string}T{start_time}"
        pub_before = f"{date_string}T{end_time}"
        
        chunk_hits = fetch_jobs_for_time_range(pub_after, pub_before)
        all_hits.extend(chunk_hits)
        print(".", end="", flush=True)

    print(f" -> {len(all_hits)} jobb.")
    return all_hits

def upsert_jobs(jobs):
    if not jobs:
        return 0

    batch_size = 100
    upserted_count = 0
    
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]
        job_data_batch = []

        for job in batch:
            workplace = job.get("workplace_address") or {}
            occupation = job.get("occupation") or {}
            description = job.get("description") or {}

            # Hämta koordinater om de finns direkt i API:t
            lat = None
            lon = None
            if workplace.get("coordinates"):
                # API ger ofta [lon, lat] - kontrollera ordning!
                # Vanligtvis i GeoJSON är det [lon, lat]
                coords = workplace.get("coordinates")
                if len(coords) == 2:
                    lon = coords[0]
                    lat = coords[1]

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
                "location_lat": lat,
                "location_lon": lon,
                "embedding": None, # Nollställ för att tvinga ny vektorisering
                "source_snapshot": job  # ✅ HÄR SPARAS HELA OBJEKTET
            }
            job_data_batch.append(job_data)

        try:
            # Upsert med on_conflict='id' uppdaterar befintliga rader
            supabase.table("job_ads").upsert(job_data_batch, on_conflict='id').execute()
            upserted_count += len(job_data_batch)
        except Exception as e:
            print(f"      ❌ DB Fel: {e}")

    return upserted_count

def run_full_load():
    print(f"🚀 Startar hämtning av jobbdata (Sista {DAYS_TO_FETCH} dagarna)")
    
    total_jobs = 0
    start_date = datetime.now() - timedelta(days=DAYS_TO_FETCH)
    
    for i in range(DAYS_TO_FETCH + 1):
        current_date = start_date + timedelta(days=i)
        date_str = current_date.strftime("%Y-%m-%d")
        
        daily_jobs = fetch_jobs_for_date(date_str)
        
        if daily_jobs:
            count = upsert_jobs(daily_jobs)
            total_jobs += count
            
    print(f"\n✅ KLAR! Totalt sparade/uppdaterade jobb: {total_jobs}")

if __name__ == "__main__":
    run_full_load()