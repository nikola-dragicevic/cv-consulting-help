# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import json
import math
from supabase import create_client, Client
from dotenv import load_dotenv
from parse_cv_pdf import extract_text_from_pdf, summarize_cv_text

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
DIMS = 1024

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def normalize_vector(vector: list[float]) -> list[float]:
    if not vector: return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0: return [0.0] * len(vector)
    return [x / magnitude for x in vector]

async def get_local_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(OLLAMA_URL, json={"model": EMBEDDING_MODEL, "prompt": text})
        response.raise_for_status()
        embedding = response.json().get("embedding")
        if not embedding or len(embedding) != DIMS:
            raise ValueError(f"Invalid embedding dims: {len(embedding)}")
        return normalize_vector(embedding)

def generate_prompt(profile: dict, cv_text: str = "") -> str:
    out = [f"Kandidat: {profile['full_name']} ({profile['email']})"]
    if cv_text: out.append(f"CV Sammanfattning: {cv_text}")
    if profile.get("quiz_answers"):
        for key, val in profile["quiz_answers"].items():
            if isinstance(val, list): val = ", ".join(val)
            out.append(f"{key}: {val}")
    if profile.get("additional_info"): out.append(f"Extra info: {profile['additional_info']}")
    return "\n".join(out)

async def enrich_candidates():
    """Fetch candidates without vectors and enrich them."""
    # Look for NULL in 'profile_vector'
    response = supabase.table("candidate_profiles").select("*").filter("profile_vector", "is", "null").execute()
    candidates = response.data

    if not candidates:
        return # Silent return if nothing to do

    print(f"📋 Found {len(candidates)} candidates to vectorize...")

    for candidate in candidates:
        print(f"   Processing: {candidate['email']}")
        cv_summary = ""
        if candidate.get("cv_file_url") and candidate.get("cv_bucket_path"):
            try:
                # Use the saved storage path directly
                storage_path = candidate["cv_bucket_path"] 
                
                # Check for 'cvs/' prefix redundancy
                if storage_path.startswith("cvs/"):
                    clean_path = storage_path
                else:
                    clean_path = storage_path

                # Create temp file
                local_path = f"./downloads/{os.path.basename(clean_path)}"
                os.makedirs("./downloads", exist_ok=True)

                # Download using Supabase Storage API directly
                file_data = supabase.storage.from_("cvs").download(clean_path)
                with open(local_path, "wb") as f:
                    f.write(file_data)

                raw_cv = extract_text_from_pdf(local_path)
                cv_summary = summarize_cv_text(raw_cv)
                os.remove(local_path) # Clean up
            except Exception as e:
                print(f"   ⚠️ CV Parse Error: {e}")

        # Create embedding
        prompt = generate_prompt(candidate, cv_summary)
        try:
            vector = await get_local_embedding(prompt)
            supabase.table("candidate_profiles").update({"profile_vector": vector}).eq("id", candidate["id"]).execute()
            print(f"   ✅ Vectorized {candidate['email']}")
        except Exception as e:
            print(f"   ❌ Failed to embed {candidate['email']}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())