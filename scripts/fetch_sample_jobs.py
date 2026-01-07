import requests
import json
import os

def fetch_and_save_jobs():
    print("🚀 Fetching 150 jobs from JobTech API...")
    
    all_hits = []
    url = "https://jobsearch.api.jobtechdev.se/search"
    
    try:
        # Batch 1: 100 jobs
        print("   📡 Fetching batch 1 (0-100)...")
        resp1 = requests.get(url, params={"q": "*", "limit": 100, "sort": "pubdate-desc"}, timeout=10)
        resp1.raise_for_status()
        hits1 = resp1.json().get("hits", [])
        all_hits.extend(hits1)

        # Batch 2: 50 jobs
        print("   📡 Fetching batch 2 (100-150)...")
        resp2 = requests.get(url, params={"q": "*", "limit": 50, "offset": 100, "sort": "pubdate-desc"}, timeout=10)
        resp2.raise_for_status()
        hits2 = resp2.json().get("hits", [])
        all_hits.extend(hits2)

    except Exception as e:
        print(f"❌ API Error: {e}")
        return
    
    # 1. Save Raw JSON
    print(f"💾 Saving {len(all_hits)} jobs to 'jobs_150.json'...")
    with open("jobs_150.json", "w", encoding="utf-8") as f:
        json.dump(all_hits, f, ensure_ascii=False, indent=2)

    # 2. Save Readable Text
    print(f"📄 Saving readable summary to 'jobs_150.txt'...")
    with open("jobs_150.txt", "w", encoding="utf-8") as f:
        for job in all_hits:
            headline = job.get('headline', 'No Title')
            jid = job.get('id', 'No ID')
            emp = job.get('employer', {}).get('name', 'Unknown Employer')
            desc = job.get('description', {}).get('text', '') or ""
            
            f.write(f"=== {headline} ===\n")
            f.write(f"ID: {jid}\n")
            f.write(f"Employer: {emp}\n")
            f.write(f"--- Description ---\n")
            f.write(f"{desc[:500]}...\n") # Truncated for readability
            f.write("\n" + "="*40 + "\n\n")

    print("✅ Done! Files created.")

if __name__ == "__main__":
    fetch_and_save_jobs()
