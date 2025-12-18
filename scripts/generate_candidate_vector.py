# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import math
from supabase import create_client, Client
from dotenv import load_dotenv

# Import PDF parser handling both module and script execution
try:
    from scripts.parse_cv_pdf import extract_text_from_pdf, summarize_cv_text
except ImportError:
    from parse_cv_pdf import extract_text_from_pdf, summarize_cv_text

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2")
DIMS = 1024

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Missing Supabase credentials in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def normalize_vector(vector: list[float]) -> list[float]:
    if not vector: return []
    mag = math.sqrt(sum(x**2 for x in vector))
    if mag == 0: return [0.0] * len(vector)
    return [x / mag for x in vector]

async def get_local_embedding(text: str) -> list[float]:
    if not text or not text.strip(): return [0.0] * DIMS
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(OLLAMA_URL, json={"model": EMBEDDING_MODEL, "prompt": text})
            resp.raise_for_status()
            data = resp.json()
            emb = data.get("embedding")
            
            if not emb:
                print(f"   ⚠️ Warning: No embedding returned from Ollama")
                return [0.0] * DIMS
                
            if len(emb) != DIMS:
                raise ValueError(f"Dim mismatch: Expected {DIMS}, got {len(emb)}")
                
            return normalize_vector(emb)
        except Exception as e:
            print(f"   ❌ Embedding Connection Error: {e}")
            raise e

async def enrich_candidates():
    print("📋 Checking for candidates with missing 'profile_vector'...")
    
    # 1. Select only where profile_vector is NULL
    res = supabase.table("candidate_profiles").select("*").is_("profile_vector", "null").execute()
    candidates = res.data

    if not candidates:
        print("✅ No candidates need updating.")
        return

    print(f"📋 Found {len(candidates)} candidates to process.")

    for c in candidates:
        email = c.get('email', 'Unknown')
        print(f"   Processing: {email}")
        
        cv_text = ""
        bucket_path = c.get("cv_bucket_path")
        
        # Determine file extension
        is_pdf = bucket_path.lower().endswith(".pdf") if bucket_path else False
        local_ext = ".pdf" if is_pdf else ".txt"
        local_path = f"temp_{c['id']}{local_ext}"
        
        parse_success = False

        # 2. Download and Parse CV
        if bucket_path:
            try:
                print(f"   ⬇️ Downloading CV ({local_ext}): {bucket_path}")
                data = supabase.storage.from_("cvs").download(bucket_path)
                
                with open(local_path, "wb") as f: f.write(data)
                
                if is_pdf:
                    # PDF Pathway
                    raw = extract_text_from_pdf(local_path)
                    cv_text = summarize_cv_text(raw)
                else:
                    # Text Pathway (Direct read)
                    with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)

                if cv_text and len(cv_text) > 50:
                    print(f"   📄 Extracted {len(cv_text)} chars from CV.")
                    parse_success = True
                else:
                    print(f"   ⚠️ Warning: CV text is empty or too short.")

            except Exception as e:
                print(f"   ❌ CV Download/Parse Error: {e}")
            finally:
                if os.path.exists(local_path): os.remove(local_path)

        # 3. Validation: Don't embed if we have no CV text
        if not parse_success:
            print(f"   ⏭️ Skipping {email}: Could not extract text from CV.")
            continue 

        # 4. Create Prompt and Embed
        info_parts = [f"Candidate: {c.get('full_name', '')}"]
        info_parts.append(f"CV Content: {cv_text}")
        
        if c.get("additional_info"):
            info_parts.append(f"Additional Info: {c['additional_info']}")
            
        prompt_text = "\n".join(info_parts)
        
        try:
            vec = await get_local_embedding(prompt_text)
            
            if not vec or vec == [0.0] * DIMS:
                print(f"   ⚠️ Generated vector is empty. Skipping DB update.")
                continue

            # ✅ UPPDATERING: Spara både vektor OCH texten
            supabase.table("candidate_profiles")\
                .update({
                    "profile_vector": vec,
                    "candidate_text_vector": prompt_text
                })\
                .eq("id", c["id"])\
                .execute()
                
            print(f"   ✅ Successfully updated profile_vector for {email}")

        except Exception as e:
            print(f"   ❌ Failed to process {email}: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())