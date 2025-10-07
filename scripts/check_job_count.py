# scripts/check_job_count.py
# Check how many jobs we can actually fetch from the API

import os
import sys
import requests
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")
API_URL = "https://jobsearch.api.jobtechdev.se/search"

def check_total_jobs():
    print("[CHECK] Verifying total job count from API...\n")

    headers = {}
    if JOBTECH_API_KEY:
        headers["api-key"] = JOBTECH_API_KEY

    # Test different offsets to see pagination limits
    test_offsets = [0, 1000, 2000, 2100, 2200]

    for offset in test_offsets:
        params = {
            "limit": 10,
            "offset": offset,
            "published-after": "2024-01-01",
            "sort": "pubdate-desc"
        }

        try:
            response = requests.get(API_URL, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

            total = data.get("total", {}).get("value", 0)
            hits = len(data.get("hits", []))

            print(f"Offset {offset:5d}: Total={total:6d}, Returned={hits} jobs")

            if hits == 0:
                print(f"  └─> [LIMIT] No jobs returned at offset {offset}")
                break

        except Exception as e:
            print(f"  └─> [ERROR] Failed at offset {offset}: {e}")
            break

    print(f"\n[INFO] The API has a hard limit on pagination!")
    print(f"[INFO] This is common with search APIs - they limit deep pagination.")

if __name__ == "__main__":
    check_total_jobs()
