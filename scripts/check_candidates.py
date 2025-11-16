# scripts/check_candidates.py

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

response = supabase.table("candidate_profiles").select("id, full_name, email, created_at").order("created_at", desc=True).limit(10).execute()

candidates = response.data

if not candidates:
    print("❌ No candidates found.")
else:
    print("✅ Candidates in database:")
    for c in candidates:
        print(f"- {c['full_name']} ({c['email']}) | ID: {c['id']}")
