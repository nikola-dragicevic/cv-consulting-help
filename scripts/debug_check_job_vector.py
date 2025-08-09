from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

res = supabase.table("job_ads").select("id, embedding").limit(5).execute()

for row in res.data:
    if row["embedding"]:
        print(f"Job ID: {row['id']} → Dimensions: {len(row['embedding'])}")
