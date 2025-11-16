# scripts/debug_check_job_vector.py
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

res = supabase.table("job_ads").select("id, embedding").execute()

wrong_dim = []
right_dim = []

for job in res.data:
    emb = job.get("embedding")
    if not emb:
        continue
    if len(emb) != 768:
        wrong_dim.append(job["id"])
    else:
        right_dim.append(job["id"])

print(f"✅ Correct vectors: {len(right_dim)}")
print(f"❌ Wrong vectors: {len(wrong_dim)}")
if wrong_dim:
    print("Wrong vector job IDs:", wrong_dim[:20], "...")
