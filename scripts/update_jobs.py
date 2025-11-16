# scripts/update_jobs.py

import os
import requests
import json
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
STREAM_API_URL = "https://jobtechdev.se/api/af/stream"
TIMESTAMP_FILE = "last_run.json"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def load_last_timestamp():
    if os.path.exists(TIMESTAMP_FILE):
        with open(TIMESTAMP_FILE, "r") as f:
            return json.load(f).get("last_timestamp")
    return None


def save_last_timestamp(ts):
    with open(TIMESTAMP_FILE, "w") as f:
        json.dump({"last_timestamp": ts}, f)


def fetch_new_jobs(since_timestamp):
    params = {"date": since_timestamp} if since_timestamp else {}
    print(f"📡 Fetching jobs since: {since_timestamp}")
    response = requests.get(STREAM_API_URL, params=params)
    response.raise_for_status()
    return response.json().get("hits", [])


def upsert_jobs(jobs):
    print(f"🛠 Upserting {len(jobs)} new jobs...")
    for job in jobs:
        job_data = {
            "id": str(job.get("id")),
            "headline": job.get("headline", {}).get("sv"),
            "description_text": job.get("description", {}).get("text", {}).get("sv"),
            "location": job.get("workplace_address", {}).get("municipality", {}).get("sv"),
            "published_date": job.get("publication_date"),
            "embedding": None,  # to be enriched later
            "job_category": job.get("occupation_label", {}).get("sv"),
            "requires_dl_b": job.get("driving_license", {}).get("b"),
        }

        supabase.table("job_ads").upsert(job_data).execute()

    print("✅ Done.")


if __name__ == "__main__":
    last_ts = load_last_timestamp()
    jobs = fetch_new_jobs(last_ts)

    if jobs:
        upsert_jobs(jobs)
        latest_ts = max([job["publication_date"] for job in jobs if job.get("publication_date")])
        save_last_timestamp(latest_ts)
    else:
        print("✅ No new jobs to update.")
