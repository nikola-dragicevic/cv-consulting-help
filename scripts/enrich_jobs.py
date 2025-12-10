# scripts/enrich_jobs.py

import os
import sys
import asyncio
import httpx
import json
import math
from supabase import create_client, Client
from dotenv import load_dotenv

# Fix Windows console encoding (Harmless on Linux, good to keep for dev)
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# CHANGED: Updated default model to match your new architecture
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2") 

# CHANGED: Use OLLAMA_URL env var so it works in Docker (http://ollama:11434/...) 
# fallback to localhost for local dev.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/embeddings")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def normalize_vector(vector: list[float]) -> list[float]:
    """
    Normalizes a vector to unit length (L2 norm).
    Crucial for accurate cosine similarity when using dot product.
    """
    if not vector:
        return []
    
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * len(vector)
        
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> list[float]:
    """Send text to Ollama and get normalized embedding."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(OLLAMA_URL, json={
                "model": EMBEDDING_MODEL,
                "prompt": text
            })
            response.raise_for_status()
            
            data = response.json()
            embedding = data.get("embedding")

            # CHANGED: Validation for 1024 dimensions
            if not embedding or len(embedding) != 1024:
                raise ValueError(f"Invalid embedding received. Expected 1024, got {len(embedding) if embedding else 'None'}")
            
            # CHANGED: Apply normalization before returning
            return normalize_vector(embedding)

        except httpx.RequestError as e:
            print(f"❌ Connection error to Ollama at {OLLAMA_URL}: {e}")
            raise

async def enrich_job_vectors():
    """Fetch jobs without vectors and create embeddings for them."""
    os.makedirs("logs", exist_ok=True)
    failed_jobs_path = "logs/enrich_failed_jobs.jsonl"

    print(f"📦 Using embedding model: {EMBEDDING_MODEL}")
    print(f"🔗 Connecting to Ollama at: {OLLAMA_URL}")

    while True:
        # Fetch a batch of jobs where embedding is NULL
        # Note: 'embedding' column must exist and be vector(1024)
        response = supabase.table("job_ads") \
            .select("id, headline, description_text") \
            .is_("embedding", "null") \
            .limit(50) \
            .execute()

        jobs = response.data
        if not jobs:
            print("✅ All jobs seem to be vectorized. Exiting.")
            break

        print(f"🔄 Found {len(jobs)} jobs to vectorize. Starting batch...")

        tasks = []
        for job in jobs:
            job_id = job["id"]
            headline = job.get("headline") or ""
            description = job.get("description_text") or ""

            if not headline and not description:
                print(f"⚠️ Skipping job {job_id} due to empty content.")
                continue

            prompt_text = f"Job Title: {headline}\n\nJob Description: {description}"
            
            # Process strictly one by one to avoid overloading Ollama on small servers
            # (or you can use asyncio.gather for parallelism if the server is strong)
            try:
                embedding = await get_local_embedding(prompt_text)
                
                # Update Supabase
                supabase.table("job_ads") \
                    .update({"embedding": embedding}) \
                    .eq("id", job_id) \
                    .execute()
                
                print(f"   ✅ Saved {job_id}")

            except Exception as e:
                print(f"   ❌ Failed {job_id}: {e}")
                with open(failed_jobs_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"id": job_id, "error": str(e)}) + "\n")

    print("🎉 Job enrichment process complete.")

if __name__ == "__main__":
    try:
        asyncio.run(enrich_job_vectors())
    except KeyboardInterrupt:
        print("\n🛑 Process stopped by user.")