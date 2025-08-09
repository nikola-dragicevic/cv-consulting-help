# scripts/initial_load.py

import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

API_URL = "https://jobtechdev.se/api/af/snapshot"


def fetch_jobs():
    print("📥 Fetching raw job data from JobTechDev API...")
    response = requests.get(API_URL)
    response.raise_for_status()
    return response.json().get("hits", [])


def upsert_jobs(jobs):
    print(f"🛠 Upserting {len(jobs)} jobs to Supabase...")
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
    jobs = fetch_jobs()
    upsert_jobs(jobs)
