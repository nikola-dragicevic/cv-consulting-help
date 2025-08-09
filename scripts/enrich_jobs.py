# scripts/enrich_jobs.py

import os
import asyncio
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv
import json

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
LOCAL_EMBEDDING_URL = "http://localhost:11434/api/embeddings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def get_local_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient() as client:
        response = await client.post(LOCAL_EMBEDDING_URL, json={
            "model": "nomic-embed-text",
            "prompt": text
        })
        response.raise_for_status()
        return response.json().get("embedding")

async def enrich_jobs():
    os.makedirs("logs", exist_ok=True)
    failed_jobs_path = "logs/failed_jobs.jsonl"

    while True:
        response = supabase.table("job_ads").select("id, description_text").filter("embedding", "is", "null").limit(100).execute()
        jobs = response.data

        if not jobs:
            print("✅ All jobs enriched.")
            break

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
                    print(f"✅ Enriched job: {job_id}")
                else:
                    raise ValueError("Invalid embedding returned.")
            except Exception as e:
                print(f"❌ Failed job: {job_id} – {str(e)}")
                with open(failed_jobs_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": job_id, "error": str(e)}) + "\n")

if __name__ == "__main__":
    asyncio.run(enrich_jobs())
