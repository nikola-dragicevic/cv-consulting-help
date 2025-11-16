# scripts/match_jobs.py

import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_candidates_with_vectors():
    """Fetch candidates who already have embeddings (vector not null)."""
    resp = (
        supabase.table("candidate_profiles")
        .select("id, full_name, email, vector")
        .filter("vector", "not.is", "null")
        .execute()
    )
    return resp.data

def match_jobs_for_candidate(vector, top_k=5):
    """Call the match_jobs Postgres function."""
    resp = supabase.rpc("match_jobs", {
        "embedding": vector,
        "top_k": top_k
    }).execute()
    return resp.data

if __name__ == "__main__":
    os.makedirs("logs", exist_ok=True)
    log_file = "logs/matched_jobs.jsonl"

    print("🚀 Fetching candidates with vectors...")
    candidates = get_candidates_with_vectors()

    if not candidates:
        print("❌ No candidates found with vectors.")
        exit()

    print(f"✅ Found {len(candidates)} candidates.\n")

    for cand in candidates:
        print(f"👤 Candidate: {cand['full_name']} ({cand['email']})")
        matches = match_jobs_for_candidate(cand["vector"], top_k=5)

        if not matches:
            print("⚠️ No matches found.\n")
            continue

        for i, job in enumerate(matches, start=1):
            print(f"   [{i}] {job['headline']} — Similarity: {job['similarity']:.4f}")
        
        # Save matches to log file
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "candidate_id": cand["id"],
                "candidate_name": cand["full_name"],
                "matches": matches
            }) + "\n")

        print("")  # Blank line between candidates

    print(f"📄 Matches saved to {log_file}")
