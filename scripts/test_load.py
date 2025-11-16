# scripts/test_load.py
# Test script - Laddar bara 200 jobb för att testa att allt fungerar

import os
import sys
import requests
import time
from supabase import create_client, Client
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")

API_BASE_URL = "https://jobsearch.api.jobtechdev.se"
SEARCH_ENDPOINT = f"{API_BASE_URL}/search"
BATCH_SIZE = 100
REQUEST_DELAY = 0.5

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("[ERROR] Saknar Supabase miljövariabler")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_batch(offset=0, limit=BATCH_SIZE):
    headers = {}
    if JOBTECH_API_KEY:
        headers["api-key"] = JOBTECH_API_KEY

    params = {
        "limit": limit,
        "offset": offset,
        "published-after": "2024-01-01",
        "sort": "pubdate-desc"
    }

    try:
        response = requests.get(SEARCH_ENDPOINT, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        total = data.get("total", {}).get("value", 0)
        hits = data.get("hits", [])
        return hits, total
    except Exception as e:
        print(f"[ERROR] API-fel vid offset {offset}: {e}")
        return [], 0

def test_load():
    print("[TEST] Testar att ladda 200 jobb till Supabase...\n")

    all_jobs = []
    for offset in [0, 100]:
        print(f"[FETCH] Hämtar batch: offset={offset}, limit={BATCH_SIZE}")
        hits, total = fetch_batch(offset, BATCH_SIZE)

        if not hits:
            print(f"[WARN] Inga jobb returnerades vid offset {offset}")
            break

        all_jobs.extend(hits)
        print(f"[OK] Hämtade {len(hits)} jobb (totalt: {len(all_jobs)})")

        if offset > 0:
            time.sleep(REQUEST_DELAY)

    print(f"\n[INFO] Totalt hämtade {len(all_jobs)} jobb")

    if not all_jobs:
        print("[ERROR] Inga jobb att ladda upp")
        return

    print(f"\n[UPLOAD] Laddar upp {len(all_jobs)} jobb till Supabase...")

    job_data_batch = []
    for job in all_jobs:
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
        }
        job_data_batch.append(job_data)

    try:
        result = supabase.table("job_ads").upsert(job_data_batch, on_conflict='id').execute()
        print(f"[SUCCESS] Laddade upp {len(job_data_batch)} jobb till Supabase")
        print(f"[INFO] Resultat: {len(result.data) if result.data else 0} rader påverkade")
    except Exception as e:
        print(f"[ERROR] Uppladdningsfel: {e}")
        return

    print("\n[DONE] Test klart!")

if __name__ == "__main__":
    test_load()
