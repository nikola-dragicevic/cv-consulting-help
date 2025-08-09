# scripts/match_jobs.py

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_candidates_with_vectors():
    response = supabase.table("candidate_profiles") \
        .select("id, full_name, email, vector") \
        .filter("vector", "not.is", "null") \
        .execute()
    return response.data

def match_jobs_for_candidate(candidate):
    print(f"\n🔍 Matching jobs for {candidate['full_name']} ({candidate['email']})")
    vector = candidate["vector"]
    response = supabase.rpc("match_jobs", {
        "embedding": vector,
        "top_k": 5
    }).execute()
    return response.data

if __name__ == "__main__":
    candidates = get_candidates_with_vectors()
    if not candidates:
        print("❌ No vectorized candidates found.")
    else:
        for candidate in candidates:
            matches = match_jobs_for_candidate(candidate)
            if matches:
                print(f"✅ Top matches for {candidate['full_name']}:")
                for match in matches:
                    print(f" - {match['headline']} | {match['similarity']:.3f}")
            else:
                print("⚠️ No matches found.")
