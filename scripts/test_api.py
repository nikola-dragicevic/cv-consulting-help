# scripts/test_api.py
# Testar JobTechDev API och visar datastrukturen

import os
import sys
import requests
import json
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

JOBTECH_API_KEY = os.getenv("JOBTECH_API_KEY")
API_URL = "https://jobsearch.api.jobtechdev.se/search"

def test_api():
    """Testar API:et och visar svarsformatet"""
    print("[TEST] Testar JobTechDev Search API...")
    print(f"   Endpoint: {API_URL}\n")

    headers = {}
    if JOBTECH_API_KEY:
        headers["api-key"] = JOBTECH_API_KEY
        print("[OK] Använder API-nyckel")
    else:
        print("[WARN] Ingen API-nyckel, kan vara begränsad")

    params = {
        "limit": 5,
        "offset": 0,
        "published-after": "2024-01-01",
        "sort": "pubdate-desc"
    }

    try:
        response = requests.get(API_URL, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()

        print(f"\n[DATA] API Svar:")
        print(f"   Status: {response.status_code}")
        print(f"   Totalt tillgängliga jobb: {data.get('total', {}).get('value', 0)}")
        print(f"   Jobb i detta svar: {len(data.get('hits', []))}\n")

        if data.get("hits"):
            print("[EXAMPLE] Första jobbet:")
            first_job = data["hits"][0]
            print(json.dumps(first_job, indent=2, ensure_ascii=False)[:2000])
            print("\n...")

            print("\n[FIELDS] Tillgängliga fält i första jobbet:")
            for key in first_job.keys():
                value = first_job[key]
                value_type = type(value).__name__
                if isinstance(value, dict):
                    subkeys = list(value.keys())[:5]
                    print(f"   - {key} ({value_type}): {subkeys}")
                elif isinstance(value, list):
                    print(f"   - {key} ({value_type}, längd: {len(value)})")
                else:
                    print(f"   - {key} ({value_type})")

        print("\n[SUCCESS] API-test klart!")
        return True

    except requests.exceptions.RequestException as e:
        print(f"\n[ERROR] API-fel: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"   Status: {e.response.status_code}")
            print(f"   Svar: {e.response.text[:500]}")
        return False

if __name__ == "__main__":
    test_api()
