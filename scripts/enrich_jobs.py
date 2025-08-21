# scripts/fix_job_vectors.py

import os
import asyncio
import httpx
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "bge-base-en")  # ensure it's 768
LOCAL_EMBEDDING_URL = "http://localhost:11434/api/embeddings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def get_local_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient() as client:
        response = await client.post(LOCAL_EMBEDDING_URL, json={
            "model": EMBEDDING_MODEL,
            "prompt": text
        })
        response.raise_for_status()
        return response.json().get("embedding")

async def fix_job_vectors():
    os.makedirs("logs", exist_ok=True)
    failed_jobs_path = "logs/fix_failed_jobs.jsonl"

    while True:
        # Select jobs with wrong vector size
        response = supabase.table("job_ads") \
            .select("id, description_text, embedding") \
            .limit(500) \
            .execute()

        jobs = [
            job for job in response.data
            if job.get("embedding") and len(job["embedding"]) != 768
        ]

        if not jobs:
            print("✅ All job vectors are correct (768 dimensions).")
            break

        print(f"🔄 Found {len(jobs)} jobs with wrong vector size. Fixing...")

        for job in jobs:
            job_id = job["id"]
            desc = job.get("description_text", "").strip()

            if not desc:
                print(f"⚠️ Skipping job {job_id}, empty description.")
                continue

            try:
                embedding = await get_local_embedding(desc)
                if embedding and len(embedding) == 768:
                    supabase.table("job_ads").update({"embedding": embedding}).eq("id", job_id).execute()
                    print(f"✅ Fixed job {job_id}")
                else:
                    raise ValueError(f"Invalid embedding length: {len(embedding) if embedding else 'None'}")
            except Exception as e:
                print(f"❌ Failed job {job_id} – {str(e)}")
                with open(failed_jobs_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": job_id, "error": str(e)}) + "\n")

        # Show how many remain
        res = supabase.table("job_ads").select("id, embedding").execute()
        wrong_count = len([j for j in res.data if j.get("embedding") and len(j["embedding"]) != 768])
        print(f"📊 Jobs remaining with wrong dimensions: {wrong_count}")

if __name__ == "__main__":
    asyncio.run(fix_job_vectors())
