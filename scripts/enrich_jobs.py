# scripts/enrich_jobs.py

import os
import sys
import asyncio
import httpx
import json
from supabase import create_client, Client
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")  # Correct model for 768 dimensions
LOCAL_EMBEDDING_URL = "http://localhost:11434/api/embeddings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def get_local_embedding(text: str) -> list[float]:
    """Send text to Ollama and get embedding."""
    async with httpx.AsyncClient(timeout=60.0) as client:  # Added a longer timeout
        response = await client.post(LOCAL_EMBEDDING_URL, json={
            "model": EMBEDDING_MODEL,
            "prompt": text
        })
        response.raise_for_status()
        embedding = response.json().get("embedding")
        if not embedding or len(embedding) != 768:
            raise ValueError(f"Invalid embedding received from Ollama. Length: {len(embedding) if embedding else 'None'}")
        return embedding

async def enrich_job_vectors():
    """Fetch jobs without vectors and create embeddings for them."""
    os.makedirs("logs", exist_ok=True)
    failed_jobs_path = "logs/enrich_failed_jobs.jsonl"

    print(f"📦 Using embedding model: {EMBEDDING_MODEL}")

    while True:
        # Fetch a batch of jobs where embedding is NULL
        response = supabase.table("job_ads").select("id, headline, description_text").filter("embedding", "is", "null").limit(50).execute()

        jobs = response.data
        if not jobs:
            print("✅ All jobs seem to be vectorized. Exiting.")
            break

        print(f"🔄 Found {len(jobs)} jobs to vectorize. Starting batch...")

        for job in jobs:
            job_id = job["id"]
            headline = job.get("headline", "")
            description = job.get("description_text", "")

            if not headline and not description:
                print(f"⚠️ Skipping job {job_id} due to empty headline and description.")
                continue

            # Combine headline and description for a richer context
            prompt_text = f"Job Title: {headline}\n\nJob Description: {description}"

            try:
                embedding = await get_local_embedding(prompt_text)
                supabase.table("job_ads").update({"embedding": embedding}).eq("id", job_id).execute()
                print(f"✅ Vectorized and saved job {job_id}")

            except Exception as e:
                print(f"❌ Failed to process job {job_id} – {str(e)}")
                with open(failed_jobs_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": job_id, "error": str(e)}) + "\n")

    print("🎉 Job enrichment process complete.")

if __name__ == "__main__":
    asyncio.run(enrich_job_vectors())