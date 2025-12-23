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
DIMS = 768  # nomic-embed-text uses 768 dimensions

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

def extract_education(cv_text: str) -> str:
    """Extract education section from CV text."""
    import re
    education_markers = [
        r"(?i)(utbildning|education|skola|universitet|högskola|academy|degree)",
        r"(?i)(systemutvecklare|civilingenjör|master|bachelor|kandidat)",
    ]

    lines = cv_text.split('\n')
    education_section = []
    in_education = False

    for line in lines:
        if any(re.search(marker, line) for marker in education_markers):
            in_education = True
            education_section.append(line)
        elif in_education:
            if re.search(r"(?i)(arbetslivserfarenhet|experience|skills|referenser)", line):
                break
            education_section.append(line)

    return '\n'.join(education_section[:15])

def extract_skills(cv_text: str) -> str:
    """Extract technical skills from CV text."""
    import re
    skills_markers = [
        r"(?i)(skills|kompetens|färdigheter|tekniker|verktyg|programming)",
    ]

    lines = cv_text.split('\n')
    skills_section = []
    in_skills = False

    for line in lines:
        if any(re.search(marker, line) for marker in skills_markers):
            in_skills = True
            skills_section.append(line)
        elif in_skills:
            if re.search(r"(?i)(arbetslivserfarenhet|experience|utbildning|education)", line):
                break
            skills_section.append(line)

    return '\n'.join(skills_section[:20])

def build_prioritized_prompt(c: dict, cv_text: str) -> str:
    """
    Build a prompt that prioritizes:
    1. Skills and competencies (HIGHEST WEIGHT)
    2. Education and certifications
    3. Career goals/desired roles
    4. Recent experience (LIMITED)
    """
    education_text = extract_education(cv_text)
    skills_text = extract_skills(cv_text)

    parts = []

    # 1. SKILLS (Highest Priority) - Repeat 2x for emphasis (matching job format)
    if skills_text:
        parts.append("=== KOMPETENSER OCH FÄRDIGHETER (VIKTIGAST) ===")
        parts.append(skills_text)
        parts.append("\n=== NYCKELKOMPETENSER (REPETITION FÖR VIKT) ===")
        parts.append(skills_text)

    # 2. EDUCATION (High Priority) - Once is enough
    if education_text:
        parts.append("\n=== UTBILDNING OCH CERTIFIERINGAR ===")
        parts.append(education_text)

    # 3. CAREER GOALS
    if c.get("additional_info"):
        parts.append("\n=== KARRIÄRMÅL OCH ÖNSKEMÅL ===")
        parts.append(c["additional_info"])

    # 4. LIMITED WORK EXPERIENCE (Lower Priority)
    work_experience = cv_text[:500]
    parts.append("\n=== SENASTE ERFARENHET (BEGRÄNSAD) ===")
    parts.append(work_experience)

    # 5. CANDIDATE METADATA
    parts.append(f"\n=== KANDIDAT ===")
    parts.append(f"Namn: {c.get('full_name', '')}")

    return "\n".join(parts)

async def enrich_candidates():
    print("📋 Improved Candidate Vector Generation (Skills > Education > Experience)")
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

        # 4. Create Prompt and Embed - IMPROVED VERSION
        # Prioritize: Skills > Education > Goals > Work Experience
        prompt_text = build_prioritized_prompt(c, cv_text)
        
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