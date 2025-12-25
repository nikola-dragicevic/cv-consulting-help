# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import math
from supabase import create_client, Client
from dotenv import load_dotenv

# Import both parsers
try:
    from scripts.parse_cv_pdf import extract_text_from_pdf, extract_text_from_docx, summarize_cv_text
except ImportError:
    from parse_cv_pdf import extract_text_from_pdf, extract_text_from_docx, summarize_cv_text

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
DIMS = 768

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ... (Keep helper functions: normalize_vector, get_local_embedding, extract_education, extract_skills, build_prioritized_prompt exactly as they were) ...
# (For brevity, I am not repeating the helper functions here, assume they are unchanged)

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
            if not emb: return [0.0] * DIMS
            return normalize_vector(emb)
        except Exception as e:
            print(f"   ❌ Embedding Error: {e}")
            raise e

def extract_education(cv_text: str) -> str:
    # ... (Keep existing logic) ...
    return cv_text[:1000] # Simplified for display, keep your original logic

def extract_skills(cv_text: str) -> str:
     # ... (Keep existing logic) ...
    return cv_text[:1000] # Simplified for display, keep your original logic

def build_prioritized_prompt(c: dict, cv_text: str) -> str:
    # ... (Keep existing logic) ...
    return f"{c.get('full_name')} {cv_text[:2000]}" # Simplified

async def enrich_candidates():
    print("📋 Improved Candidate Vector Generation")
    
    # Fetch candidates with missing vector
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
        bucket_path = c.get("cv_bucket_path", "")
        
        # ✅ FIX: Better file extension detection
        local_ext = ".txt"
        if bucket_path.lower().endswith(".pdf"):
            local_ext = ".pdf"
        elif bucket_path.lower().endswith(".docx"):
            local_ext = ".docx"
            
        local_path = f"temp_{c['id']}{local_ext}"
        parse_success = False

        if bucket_path:
            try:
                print(f"   ⬇️ Downloading CV ({local_ext}): {bucket_path}")
                data = supabase.storage.from_("cvs").download(bucket_path)
                
                with open(local_path, "wb") as f: f.write(data)
                
                # ✅ FIX: Route to correct parser
                if local_ext == ".pdf":
                    raw, _ = extract_text_from_pdf(local_path) # unpacking tuple
                    cv_text = summarize_cv_text(raw)
                elif local_ext == ".docx":
                    raw = extract_text_from_docx(local_path)
                    cv_text = summarize_cv_text(raw)
                else:
                    # Text file
                    with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)

                if cv_text and len(cv_text) > 50:
                    print(f"   📄 Extracted {len(cv_text)} chars.")
                    parse_success = True
                else:
                    print(f"   ⚠️ Warning: CV text empty or too short.")

            except Exception as e:
                print(f"   ❌ CV Download/Parse Error: {e}")
            finally:
                if os.path.exists(local_path): os.remove(local_path)

        if not parse_success:
            print(f"   ⏭️ Skipping {email}: No text.")
            continue 

        # Generate Vector
        try:
            # Re-import your build_prioritized_prompt from your original file or use the logic here
            from scripts.generate_candidate_vector import build_prioritized_prompt as build_prompt_fn
            prompt_text = build_prompt_fn(c, cv_text) 
        except ImportError:
            # Fallback if running directly
            prompt_text = f"{c.get('full_name', '')}\n{cv_text}"

        try:
            vec = await get_local_embedding(prompt_text)
            
            supabase.table("candidate_profiles").update({
                "profile_vector": vec,
                "candidate_text_vector": prompt_text
            }).eq("id", c["id"]).execute()
                
            print(f"   ✅ Updated vector for {email}")

        except Exception as e:
            print(f"   ❌ Failed to update DB: {e}")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())