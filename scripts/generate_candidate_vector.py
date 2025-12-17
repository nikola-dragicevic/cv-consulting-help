import os
import asyncio
import httpx
import json
import math
from supabase import create_client, Client
from dotenv import load_dotenv
# FIXED IMPORT: We are running this inside the 'scripts' folder
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
    mag = math.sqrt(sum(x**2 for x in vector))
    if mag == 0: return [0.0] * len(vector)
    return [x / mag for x in vector]

async def get_local_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(OLLAMA_URL, json={"model": EMBEDDING_MODEL, "prompt": text})
        resp.raise_for_status()
        emb = resp.json().get("embedding")
        if not emb or len(emb) != DIMS: raise ValueError(f"Dim mismatch: {len(emb)}")
        return normalize_vector(emb)

async def enrich_candidates():
    print("📋 Checking candidates...")
    # Fetch profiles with NULL vector
    res = supabase.table("candidate_profiles").select("*").filter("profile_vector", "is", "null").execute()
    candidates = res.data
    if not candidates:
        print("✅ No pending candidates.")
        return

    print(f"📋 Found {len(candidates)} candidates.")

    for c in candidates:
        print(f"   Processing: {c['email']}")
        cv_text = ""
        local_path = f"temp_{c['id']}.pdf"
        
        # Try to download CV
        if c.get("cv_bucket_path"):
            try:
                data = supabase.storage.from_("cvs").download(c["cv_bucket_path"])
                with open(local_path, "wb") as f: f.write(data)
                
                # Parse PDF
                raw = extract_text_from_pdf(local_path)
                cv_text = summarize_cv_text(raw)
            except Exception as e:
                print(f"   ⚠️ CV Error: {e}")
            finally:
                if os.path.exists(local_path): os.remove(local_path)

        # Generate Prompt & Embed
        info = [f"Kandidat: {c['full_name']}"]
        if cv_text: info.append(f"CV: {cv_text}")
        if c.get("additional_info"): info.append(f"Info: {c['additional_info']}")
        prompt = "\n".join(info)

        try:
            vec = await get_local_embedding(prompt)
            supabase.table("candidate_profiles").update({"profile_vector": vec}).eq("id", c["id"]).execute()
            print(f"   ✅ Saved {c['email']}")
        except Exception as e:
            print(f"   ❌ Failed {c['email']}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())
