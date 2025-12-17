# scripts/initial_load.py
import os
import sys
import requests
import time
import traceback
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# Tvinga utskrift direkt till loggen (viktigt för Docker)
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

# --- INSTÄLLNINGAR FÖR ATT ÅTERUPPTA ---
# Om den kraschade på 2025-08-19, sätt startdatumet strax innan.
# 120 dagar bakåt från idag (dec) är ca aug.
# Sätt denna till 0 för att börja från IDAG och gå bakåt.
# Sätt till t.ex. 0 om du vill köra allt, eller justera om du vet exakt dag.
START_DAY_OFFSET = 0 
DAYS_TO_FETCH = 120
BATCH_SIZE = 100
REQUEST_DELAY = 0.5 # Lite långsammare för att vara snäll mot API

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def log(msg):
    print(msg, flush=True)

def fetch_jobs_for_time_range(pub_after, pub_before):
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
            response = requests.get(SEARCH_ENDPOINT, params=params, headers=headers, timeout=30)
            if response.status_code == 429:
                log(" ⏳ Rate limit! Väntar 10s...")
                time.sleep(10)
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
                log(f" (⚠️ Max offset nådd för intervall {pub_after})")
                break

            time.sleep(REQUEST_DELAY)

        except Exception as e:
            log(f" ❌ API Fel vid hämtning: {e}")
            break
            
    return hits_for_chunk

def fetch_jobs_for_date(date_string):
    all_hits = []
    # 6 tidsblock per dag för att hantera API-gränser
    time_chunks = [
        ("00:00:00", "03:59:59"),
        ("04:00:00", "07:59:59"),
        ("08:00:00", "11:59:59"),
        ("12:00:00", "15:59:59"),
        ("16:00:00", "19:59:59"),
        ("20:00:00", "23:59:59")
    ]

    log(f"   📅 Bearbetar {date_string} ...")
    
    for start_time, end_time in time_chunks:
        pub_after = f"{date_string}T{start_time}"
        pub_before = f"{date_string}T{end_time}"
        
        try:
            chunk_hits = fetch_jobs_for_time_range(pub_after, pub_before)
            all_hits.extend(chunk_hits)
        except Exception as e:
            log(f"CRASH in time chunk {start_time}: {e}")
            traceback.print_exc()

    return all_hits

def upsert_jobs(jobs):
    if not jobs:
        return 0

    batch_size = 50 # Mindre batch för att undvika minneskrasch
    upserted_count = 0
    
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]
        job_data_batch = []

        for job in batch:
            try:
                workplace = job.get("workplace_address") or {}
                occupation = job.get("occupation") or {}
                description = job.get("description") or {}

                # --- SMART WAY: Hämta koordinater ---
                lat = None
                lon = None
                coords = workplace.get("coordinates")
                if coords and isinstance(coords, list) and len(coords) == 2:
                    lon = coords[0] 
                    lat = coords[1]
                # ------------------------------------

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
                    # VIKTIGT: Vi rör INTE embedding! Den får vara kvar som den är.
                    # "embedding": None, 
                    "location_lat": lat,
                    "location_lon": lon
                }
                job_data_batch.append(job_data)
            except Exception as e:
                log(f"⚠️ Skippar ett jobb pga datafel: {e}")

        if job_data_batch:
            try:
                # ignore_duplicates=False betyder att vi UPPDATERAR befintliga rader
                supabase.table("job_ads").upsert(job_data_batch, on_conflict='id').execute()
                upserted_count += len(job_data_batch)
                print(".", end="", flush=True) # Progress dot
            except Exception as e:
                log(f"\n      ❌ DB Upsert Fel: {e}")
                # Försök skriva ut detaljer om felet
                traceback.print_exc()

    print(" ", end="", flush=True) # Ny rad efter punkter
    return upserted_count

def run_full_load():
    log(f"🚀 Startar SÄKER hämtning & Geokodning")
    log(f"   Period: {DAYS_TO_FETCH} dagar bakåt.")
    
    total_jobs = 0
    # Börja från idag och gå bakåt
    start_date = datetime.now() - timedelta(days=START_DAY_OFFSET)
    
    for i in range(DAYS_TO_FETCH + 1):
        try:
            current_date = start_date - timedelta(days=i)
            date_str = current_date.strftime("%Y-%m-%d")
            
            daily_jobs = fetch_jobs_for_date(date_str)
            
            if daily_jobs:
                log(f"      Hittade {len(daily_jobs)} jobb. Sparar...")
                count = upsert_jobs(daily_jobs)
                total_jobs += count
                log(f"✅ Klar med {date_str}. (+{count})")
            else:
                log(f"      Inga jobb {date_str}.")
                
        except Exception as e:
            log(f"❌ KRITISKT FEL PÅ DATUM {date_str}: {e}")
            traceback.print_exc()
            # Vi fortsätter till nästa dag istället för att dö helt
            continue
            
    log(f"\n✅✅ HELT KLAR! Totalt bearbetade jobb: {total_jobs}")

if __name__ == "__main__":
    run_full_load()