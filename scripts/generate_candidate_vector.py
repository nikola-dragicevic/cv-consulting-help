# scripts/generate_candidate_vector.py
import os
import asyncio
import httpx
import math
from supabase import create_client, Client
from dotenv import load_dotenv

# Import parsers
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

def normalize_vector(vector: list[float]) -> list[float]:
    if not vector: return []
    mag = math.sqrt(sum(x**2 for x in vector))
    if mag == 0: return [0.0] * len(vector)
    return [x / mag for x in vector]

async def get_local_embedding(text: str) -> list[float]:
    # SAFETY: Ensure we never send empty or massive text
    if not text or len(text) < 5: return [0.0] * DIMS
    
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
    # Simple extraction for context
    return cv_text[:800]

def extract_skills(cv_text: str) -> str:
    # Simple extraction for context
    return cv_text[:800]

def build_prioritized_prompt(c: dict, cv_text: str) -> str:
    """
    Builds a prompt that is strictly truncated to avoid crashing Ollama on CPU.
    """
    # 1. Clean invisible characters/non-ascii
    cv_text = cv_text.encode("ascii", errors="ignore").decode()
    cv_text = cv_text.replace('\x00', '').replace('\r', ' ').replace('\n', ' ')
    
    # 2. Build parts
    parts = []
    
    # Header
    parts.append(f"Candidate: {c.get('full_name', 'Unknown')}")
    
    # CV Content (Prioritize the top part which usually has summary/skills)
    # We take the first 1500 chars which is roughly 300-400 tokens
    parts.append(f"CV Content: {cv_text[:1500]}")
    
    final_prompt = " ".join(parts)
    
    # ✅ HARD LIMIT: 2000 characters (approx 500 tokens)
    # This fits safely within the 512 batch size limit
    if len(final_prompt) > 2000:
        final_prompt = final_prompt[:2000]
        
    return final_prompt

async def enrich_candidates():
    print("📋 Safer Candidate Vector Generation (Max 2000 chars)")
    
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
        
        # Determine extension
        local_ext = ".txt"
        if bucket_path.lower().endswith(".pdf"): local_ext = ".pdf"
        elif bucket_path.lower().endswith(".docx"): local_ext = ".docx"
            
        local_path = f"temp_{c['id']}{local_ext}"
        parse_success = False

        if bucket_path:
            try:
                print(f"   ⬇️ Downloading CV ({local_ext})...")
                data = supabase.storage.from_("cvs").download(bucket_path)
                with open(local_path, "wb") as f: f.write(data)
                
                if local_ext == ".pdf":
                    raw, _ = extract_text_from_pdf(local_path)
                    cv_text = summarize_cv_text(raw)
                elif local_ext == ".docx":
                    raw = extract_text_from_docx(local_path)
                    cv_text = summarize_cv_text(raw)
                else:
                    with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)

                if cv_text and len(cv_text) > 50:
                    parse_success = True
                else:
                    print(f"   ⚠️ Warning: CV text empty.")

            except Exception as e:
                print(f"   ❌ Download Error: {e}")
            finally:
                if os.path.exists(local_path): os.remove(local_path)

        if not parse_success:
            print(f"   ⏭️ Skipping {email}: No text.")
            continue 

        # Generate Safe Prompt
        prompt_text = build_prioritized_prompt(c, cv_text)
        print(f"   🧠 Generating embedding ({len(prompt_text)} chars)...")

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