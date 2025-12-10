# scripts/enrich_jobs.py

import os
import sys
import asyncio
import httpx
import json
import math
from supabase import create_client, Client
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

# --- Configuration ---
# Allow these to be overridden by the importing script (service.py) if needed
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def normalize_vector(vector: list[float]) -> list[float]:
    if not vector: return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0: return [0.0] * len(vector)
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(OLLAMA_URL, json={
            "model": EMBEDDING_MODEL,
            "prompt": text
        })
        response.raise_for_status()
        data = response.json()
        embedding = data.get("embedding")

        # STRICT CHECK: 1024 Dimensions
        if not embedding or len(embedding) != 1024:
            raise ValueError(f"Invalid dimensions: {len(embedding) if embedding else 'None'}. Expected 1024.")
        
        return normalize_vector(embedding)

async def enrich_job_vectors():
    """Main function to vectorizing jobs. Can be called by scheduler."""
    os.makedirs("logs", exist_ok=True)
    failed_path = "logs/enrich_failed_jobs.jsonl"

    print(f"📦 Enriching Jobs... Model: {EMBEDDING_MODEL}")

    while True:
        # Fetch batch
        response = supabase.table("job_ads") \
            .select("id, headline, description_text") \
            .is_("embedding", "null") \
            .limit(50) \
            .execute()

        jobs = response.data
        if not jobs:
            print("✅ No jobs pending vectorization.")
            break

        print(f"🔄 Processing batch of {len(jobs)} jobs...")

        for job in jobs:
            job_id = job["id"]
            text = f"Job Title: {job.get('headline', '')}\n\nJob Description: {job.get('description_text', '')}"
            
            try:
                vector = await get_local_embedding(text)
                supabase.table("job_ads").update({"embedding": vector}).eq("id", job_id).execute()
                # print(f"   ✅ Saved {job_id}") # Optional: comment out to reduce noise in logs
            except Exception as e:
                print(f"   ❌ Failed {job_id}: {e}")
                with open(failed_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": job_id, "error": str(e)}) + "\n")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())