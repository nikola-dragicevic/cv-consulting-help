# scripts/service.py
import os
import asyncio
import schedule
import time
import httpx
import math
from contextlib import asynccontextmanager
from threading import Thread
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Import logic from other scripts
from scripts.update_jobs import run_job_update
from scripts.enrich_jobs import enrich_job_vectors
from scripts.geocode_jobs import geocode_new_jobs
from scripts.sync_active_jobs import clean_stale_jobs  # removes stale jobs
from scripts.generate_candidate_vector import (
    build_candidate_vector,  # chunking inside
    compute_category_tags_from_text,
    compute_occupation_fields,
)
import json

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# /embed endpoint only (simple legacy helper)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/embeddings")
OLLAMA_GENERATE_URL = os.getenv("OLLAMA_GENERATE_URL", "http://ollama:11434/api/generate")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
CATEGORIZATION_MODEL = os.getenv("CATEGORIZATION_MODEL", "llama3.2:3b")
DIMS = int(os.getenv("DIMS", "768"))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helper: Normalization (only used by /embed endpoint) ---
def normalize_vector(vector: list[float]) -> list[float]:
    if not vector:
        return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * len(vector)
    return [x / magnitude for x in vector]

# --- Helper: Simple Ollama Call (For /embed endpoint only) ---
async def fetch_simple_embedding(text: str):
    """Legacy helper for the simple /embed endpoint"""
    if not text or not text.strip():
        return {"vector": None}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                OLLAMA_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text},
            )
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding")

            if not embedding or len(embedding) != DIMS:
                return {"vector": None}

            return {"vector": normalize_vector(embedding)}

        except httpx.RequestError as e:
            print(f"❌ Connection error to Ollama: {e}")
            raise HTTPException(503, "Embedding service unavailable")

# --- Background Pipeline ---
def run_daily_pipeline():
    print(f"🚀 [CRON] Starting daily job pipeline: {time.ctime()}")
    try:
        # 1) Remove stale jobs first
        clean_stale_jobs()

        # 2) Fetch new/changed jobs
        run_job_update()

        # 3) Enrich jobs missing embeddings (CPU-safe script)
        asyncio.run(enrich_job_vectors())

        # 4) Geocode missing lat/lon
        asyncio.run(geocode_new_jobs())

        print("✅ [CRON] Pipeline finished successfully")
    except Exception as e:
        print(f"❌ [CRON] Pipeline failed: {e}")

def run_scheduler():
    print("⏰ Scheduler started. Pipeline set for 04:00 daily.")
    schedule.every().day.at("04:00").do(run_daily_pipeline)
    while True:
        schedule.run_pending()
        time.sleep(10)

# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"⚡ Unified Service Starting... Model: {EMBEDDING_MODEL}")
    scheduler_thread = Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    yield

app = FastAPI(lifespan=lifespan)

class EmbedRequest(BaseModel):
    text: str

class CVCategorizationRequest(BaseModel):
    cv_text: str

class JobSkillExtractionRequest(BaseModel):
    job_id: int
    description: str

class ProfileUpdateWebhook(BaseModel):
    user_id: str
    cv_text: str

@app.get("/health")
def health():
    return {"status": "ok", "model": EMBEDDING_MODEL, "dims": DIMS}

@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")

    # Keep /embed small and stable
    text = req.text[:1500]
    return await fetch_simple_embedding(text)

# All 21 Arbetsförmedlingen occupation field names — hardcoded so the LLM always
# sees the COMPLETE list. Previously the code read AllJobCategoriesAndSubCategories.md
# and truncated to [:3000] chars, which only covered the first ~4 categories.
_OCCUPATION_FIELDS_LIST = """Administration, ekonomi, juridik
Bygg och anläggning
Chefer och verksamhetsledare
Data/IT
Försäljning, inköp, marknadsföring
Hantverksyrken
Hotell, restaurang, storhushåll
Hälso- och sjukvård
Industriell tillverkning
Installation, drift, underhåll
Kropps- och skönhetsvård
Kultur, media, design
Militärt arbete
Naturbruk
Naturvetenskapligt arbete
Pedagogiskt arbete
Sanering och renhållning
Socialt arbete
Säkerhetsarbete
Tekniskt arbete
Transport"""

# ---------------------------------------------------------------------------
# Group-level keyword fallback — maps specific occupation_group_label values
# to distinctive Swedish/English keywords found in CVs.
# Used when LLM (llama3.2:3b) is unavailable.
# Each entry corresponds to exactly one group in category_map.json.
# ---------------------------------------------------------------------------
_GROUP_KEYWORDS: dict[str, list[str]] = {
    # ── Installation, drift, underhåll ──────────────────────────────────────
    "Övriga drifttekniker och processövervakare": [
        "SCADA", "PLC", "DCS", "HMI", "drifttekniker", "processövervakare",
        "process control", "process operator", "automation engineer",
        "industrial automation", "control system", "instrumenttekniker",
    ],
    "Flygmekaniker m.fl.": [
        "aircraft mechanic", "aircraft maintenance", "flygmekaniker", "aviation",
        "avionics", "airframe", "line maintenance", "MRO", "aircraft technician",
        "AME", "Part-66", "EASA",
    ],
    "Underhållsmekaniker och maskinreparatörer": [
        "underhållsmekaniker", "maintenance mechanic", "maskinreparatör",
        "preventive maintenance", "corrective maintenance", "predictive maintenance",
    ],
    "Industrielektriker": [
        "industrielektriker", "industrial electrician", "panel builder",
        "switchboard", "elinstallation industri",
    ],
    "Installations- och serviceelektriker": [
        "installations", "serviceelektriker", "installation electrician",
        "service electrician", "elnät",
    ],
    "Fastighetsskötare": [
        "fastighetsskötare", "facility technician", "fastighet", "property maintenance",
    ],
    "Motorfordonsmekaniker och fordonsreparatörer": [
        "bilmekaniker", "fordonsreparatör", "vehicle mechanic", "motor mechanic",
        "fordonsteknik",
    ],
    "Drifttekniker vid värme- och vattenverk": [
        "fjärrvärme", "district heating", "vattenverk", "water treatment",
        "kraftvärme", "energi",
    ],
    # ── Transport ────────────────────────────────────────────────────────────
    "Arbetsledare inom lager och terminal": [
        "warehouse manager", "lagerchef", "lageransvarig", "warehouse supervisor",
        "terminal manager", "arbetsledare lager", "lagerledare",
        "warehouse operations", "WMS", "WCS",
    ],
    "Transportledare och transportsamordnare": [
        "transport coordinator", "transportledare", "transportsamordnare",
        "logistics coordinator", "distribution manager", "transport planner",
        "flödesplanerare",
    ],
    "Truckförare": [
        "truckförare", "truck operator", "forklift", "truckkort",
        "gaffeltruckförare",
    ],
    "Lager- och terminalpersonal": [
        "lagerpersonal", "lagerarbetare", "warehouse worker", "lagermedarbetare",
        "terminalarbetare",
    ],
    "Speditörer och transportmäklare": [
        "speditör", "freight forwarder", "transportmäklare", "spedition",
    ],
    # ── Data/IT ──────────────────────────────────────────────────────────────
    "Drifttekniker, IT": [
        "drifttekniker IT", "IT operations", "systems administrator",
        "IT support", "server management", "IT infrastructure",
        "NOC", "servicedesk", "IT drift",
    ],
    "Mjukvaru- och systemutvecklare m.fl.": [
        "software developer", "systemutvecklare", "programmer", "backend developer",
        "frontend developer", "fullstack", "software engineer",
        "Python", "Java", "TypeScript", "JavaScript", "React", "API development",
    ],
    "Nätverks- och systemtekniker m.fl.": [
        "network engineer", "nätverkstekniker", "system technician",
        "Cisco", "network infrastructure", "nätverksadministratör",
        "TCP/IP", "firewall",
    ],
    "Systemadministratörer": [
        "systemadministratör", "sysadmin", "system administrator",
        "active directory", "Windows Server", "Linux admin",
        "Azure AD", "Microsoft 365",
    ],
    "IT-säkerhetsspecialister": [
        "IT security", "cybersecurity", "informationssäkerhet", "penetration testing",
        "SOC", "SIEM",
    ],
    "Supporttekniker, IT": [
        "IT support", "helpdesk", "servicedesk technician", "1st line support",
        "2nd line support", "teknisk support",
    ],
    # ── Tekniskt arbete ───────────────────────────────────────────────────────
    "Ingenjörer och tekniker inom industri, logistik och produktionsplanering": [
        "industrial engineer", "industriingenjör", "production planning",
        "produktionsplanering", "logistics engineer", "supply chain engineer",
        "operations engineer", "lean engineer", "logistikingenjör",
    ],
    "Flygtekniker": [
        "flight engineer", "flygtekniker", "aircraft engineer",
        "certified aircraft", "aircraft design",
    ],
    "Ingenjörer och tekniker inom elektroteknik": [
        "electrical engineer", "elektroingenjör", "power systems",
        "high voltage", "högspänning", "elkonstruktör",
    ],
    "Ingenjörer och tekniker inom maskinteknik": [
        "mechanical engineer", "maskintekniker", "maskiningenjör",
        "maskinkonstruktör", "CAD konstruktör",
    ],
    "Civilingenjörsyrken inom logistik och produktionsplanering": [
        "MSc logistics", "civilingenjör logistik", "supply chain management",
        "operations research",
    ],
    # ── Industriell tillverkning ──────────────────────────────────────────────
    "Arbetsledare inom tillverkning": [
        "production supervisor", "tillverkningsledare", "shift leader",
        "skiftledare", "group leader produktion",
    ],
    "Svetsare och gasskärare": [
        "svetsare", "welder", "welding", "gasskärare",
    ],
    "Maskinoperatörer, påfyllning, packning och märkning": [
        "packaging operator", "packing machine", "maskinoperatör packning",
    ],
    # ── Chefer och verksamhetsledare ──────────────────────────────────────────
    "Inköps-, logistik- och transportchefer": [
        "logistics manager", "logistikchef", "supply chain director",
        "inköpschef", "operations director",
    ],
    "Produktionschefer inom tillverkning": [
        "production manager", "produktionschef", "plant manager",
        "manufacturing director",
    ],
    # ── Hotell, restaurang, storhushåll ───────────────────────────────────────
    "Restaurang- och köksbiträden m.fl.": [
        "restaurangbiträde", "köksbiträde", "kitchen aide", "kitchen assistant",
        "restaurant assistant", "dishwashing", "diskare", "diskning", "diskrum",
        "storkök", "large-scale kitchen", "meal service", "food preparation",
        "haccp", "food hygiene", "allergen", "kitchen cleaning",
    ],
    "Hovmästare och servitörer": [
        "servitör", "servitris", "servering", "serving", "waiter", "waitress",
        "guest service", "cashier", "kassa", "orders",
    ],
    "Kafé- och konditoribiträden": [
        "café", "kafé", "coffee shop", "barista", "bakery assistant", "konditori",
    ],
    "Kockar och kallskänkor": [
        "cook", "chef", "kock", "matlagning", "food prep", "meal prep",
    ],
    # ── Sanering och renhållning ───────────────────────────────────────────────
    "Städare": [
        "städare", "lokalvård", "lokalvard", "cleaner", "cleaning", "home cleaning",
        "office cleaning", "move-out cleaning", "professional cleaning", "checklists",
        "cleaning schedules", "housekeeping", "custodian",
    ],
    "Övrig hemservicepersonal m.fl.": [
        "household support", "home services", "household assistant", "hemservice",
        "childcare", "garden tasks", "home helper",
    ],
    "Renhållnings- och återvinningsarbetare": [
        "waste", "recycling", "waste sorting", "återvinning", "avfall",
    ],
    # ── Hälso- och sjukvård / socialt arbete ───────────────────────────────────
    "Vårdbiträden": [
        "home care assistant", "elderly care", "vårdbiträde", "omsorg", "hemtjänst",
        "hygiene support", "care support", "daily support for elderly",
    ],
    "Undersköterskor, hemtjänst, hemsjukvård, äldreboende och habilitering": [
        "undersköterska", "assistant nurse", "hemsjukvård", "äldreboende", "elderly home",
    ],
    "Personliga assistenter": [
        "personal assistant care", "personlig assistent", "supportive interaction with children and adults",
    ],
}


def _load_category_map() -> dict:
    """Load category_map.json from config/. Returns empty dict on failure."""
    try:
        map_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), '..', 'config', 'category_map.json'
        )
        with open(map_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ _load_category_map error: {e}")
        return {}


def groups_to_fields(group_names: list[str]) -> list[str]:
    """
    Reverse lookup: given occupation_group_label values, return their parent
    occupation_field_label values using category_map.json.
    """
    category_map = _load_category_map()
    if not category_map:
        return []
    group_set = set(group_names)
    fields = []
    for field, field_data in category_map.items():
        if any(g in group_set for g in field_data.get('groups', [])):
            fields.append(field)
    return fields


def normalize_cv_text_for_storage(text: str) -> str:
    """
    Preserve line structure for downstream parsing/keyword extraction while removing
    null bytes and noisy spacing.
    """
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.strip() for ln in text.split("\n")]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines).strip()


def simple_categorize_cv_scored(text: str, max_groups: int = 10) -> list[tuple[str, int]]:
    """
    Keyword-based categorization at occupation_group_label level.
    Scores each group by keyword hit count, returns top N groups.
    Used as fallback when LLM (llama3.2:3b) is unavailable.
    """
    t = (text or "").lower()
    if not t:
        return []

    scores: dict[str, int] = {}
    for group, keywords in _GROUP_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in t:
                scores[group] = scores.get(group, 0) + 1

    ranked = [(g, s) for g, s in scores.items() if s > 0]
    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked[:max_groups]


def simple_categorize_cv(text: str, max_groups: int = 10) -> list[str]:
    return [g for g, _ in simple_categorize_cv_scored(text, max_groups=max_groups)]


async def resolve_cv_groups(cat_text: str) -> tuple[list[str], list[str], list[tuple[str, int]], str]:
    """
    Fast-first categorization:
    - Run keyword scoring first (cheap)
    - If strong signals exist, skip LLM for speed and stability
    - Otherwise use LLM and merge keyword additions
    Returns (final_groups, llm_groups, kw_ranked, source)
    """
    kw_ranked = simple_categorize_cv_scored(cat_text, max_groups=10)
    kw_groups = [g for g, _ in kw_ranked]

    # Strong enough lexical evidence -> skip slow LLM (huge latency win on common CVs)
    # Example: kitchen/cleaning/care CVs with many explicit tokens.
    strong_kw = bool(kw_ranked) and (
        kw_ranked[0][1] >= 2 or sum(score for _, score in kw_ranked[:3]) >= 4
    )
    if strong_kw:
        return kw_groups[:5], [], kw_ranked, "keyword"

    llm_groups = await categorize_cv_text(cat_text)
    merged = list(dict.fromkeys(llm_groups + [g for g in kw_groups if g not in llm_groups]))
    final_groups = merged[:5]
    return final_groups, llm_groups, kw_ranked, ("llm+keyword" if llm_groups else "keyword")


async def categorize_cv_text(cv_text: str) -> list[str]:
    """
    LLM-based CV categorization at occupation_group_label level.
    Returns 5-10 specific group names chosen from category_map.json.
    Requires llama3.2:3b (or CATEGORIZATION_MODEL) to be available in Ollama.
    """
    if not cv_text or not cv_text.strip():
        return []

    # Build flat list of all groups from category_map.json for the LLM to choose from
    category_map = _load_category_map()
    if category_map:
        all_groups: list[str] = []
        for field_data in category_map.values():
            all_groups.extend(field_data.get('groups', []))
        groups_list = "\n".join(all_groups)
    else:
        # Absolute fallback if category_map.json is missing
        groups_list = ""

    prompt = f"""You are categorizing a CV into Swedish job market occupation groups.

Choose the 1-5 most relevant occupation groups from this EXACT list (use the names exactly as written):

{groups_list}

CV Text:
{cv_text[:3000]}

Rules:
- Pick only from the list above, using the exact Swedish names
- Return 1-5 groups, most relevant first
- If the CV clearly fits service/restaurant/cleaning/care work, prefer those groups over unrelated technical/transport groups
- Do not guess broad unrelated groups just to fill the list
- Return ONLY a JSON array, no explanation

Example output: ["Kockar och kallskänkor", "Restaurang- och köksbiträden m.fl.", "Städare"]

Your response (JSON array only):"""

    try:
        # CPU-only inference of llama3.2:3b with a ~200-line group list + CV text
        # typically takes 60-180 s. Use a generous timeout so we don't cut it short.
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                OLLAMA_GENERATE_URL,
                json={
                    "model": CATEGORIZATION_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.3,
                },
            )
            response.raise_for_status()
            data = response.json()
            generated_text = data.get("response", "")

            cleaned = generated_text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            subcategories = json.loads(cleaned)
            if isinstance(subcategories, list):
                # Validate: keep only groups that exist exactly in the taxonomy
                valid_set = set(all_groups) if all_groups else set()
                valid = [g for g in subcategories if g in valid_set]
                invalid = [g for g in subcategories if g not in valid_set]
                if invalid:
                    print(f"⚠️ [CATEGORIZATION] Discarded hallucinated groups: {invalid}")
                if valid:
                    print(f"✅ [CATEGORIZATION] Valid groups (LLM): {valid}")
                    return valid[:10]
                else:
                    print(f"⚠️ [CATEGORIZATION] No valid groups after validation, falling back to keywords")
                    return []
            else:
                print(f"⚠️ [CATEGORIZATION] Response was not a list: {subcategories}")
                return []

    except json.JSONDecodeError as e:
        print(f"⚠️ [CATEGORIZATION] Failed to parse JSON: {generated_text[:200]}")
        return []
    except httpx.RequestError as e:
        print(f"❌ Connection error to Ollama for categorization: {e}")
        return []
    except Exception as e:
        print(f"❌ Categorization error: {e}")
        return []


@app.post("/categorize-cv")
async def categorize_cv(req: CVCategorizationRequest):
    """
    Layer 1: The Filter - Categorize CV using llama3.2
    Returns top 3-5 occupation field names from Arbetsförmedlingen taxonomy
    """
    if not req.cv_text or not req.cv_text.strip():
        raise HTTPException(400, "CV text cannot be empty")

    subcategories, _, kw_ranked, source = await resolve_cv_groups(req.cv_text)
    if kw_ranked:
        print(f"🔎 [CATEGORIZATION] keyword-ranked={kw_ranked[:5]} source={source}")
    return {"subcategory_ids": subcategories}

@app.post("/extract-job-skills")
async def extract_job_skills(req: JobSkillExtractionRequest):
    """
    Layer 4: The Auditor - Extract required and preferred skills from job description
    Uses llama3.2 to extract structured skills data
    """
    if not req.description or len(req.description.strip()) < 50:
        return {"skills_data": {}}

    # Truncate very long descriptions
    desc_text = req.description[:3000]

    prompt = f"""Extract two JSON lists from this Swedish job description:
1. 'required_skills' - Must-have requirements (Krav, Kvalifikationer)
2. 'preferred_skills' - Nice-to-have requirements (Meriterande)

Include:
- Technical skills (programming languages, tools, software)
- Certifications (B-körkort, PLC, etc.)
- Experience requirements
- Education requirements
- Language requirements

Return ONLY valid JSON in this exact format:
{{
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill3", "skill4"]
}}

Job Description:
{desc_text}

Your response (JSON only):"""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                OLLAMA_GENERATE_URL,
                json={
                    "model": CATEGORIZATION_MODEL,  # Use llama3.2
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.2,
                }
            )
            response.raise_for_status()
            data = response.json()
            generated_text = data.get("response", "")

            # Clean up response
            cleaned = generated_text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            # Parse JSON
            skills_data = json.loads(cleaned)

            # Validate structure
            if isinstance(skills_data, dict):
                required = skills_data.get("required_skills", [])
                preferred = skills_data.get("preferred_skills", [])

                if not isinstance(required, list):
                    required = []
                if not isinstance(preferred, list):
                    preferred = []

                result = {
                    "required_skills": required[:15],  # Max 15 each
                    "preferred_skills": preferred[:15]
                }

                # Optionally save to database
                if req.job_id:
                    try:
                        supabase.table("job_ads").update({
                            "skills_data": result
                        }).eq("id", req.job_id).execute()
                        print(f"✅ [SKILL-EXTRACTION] Saved skills for job {req.job_id}")
                    except Exception as e:
                        print(f"⚠️ [SKILL-EXTRACTION] Failed to save: {e}")

                return {"skills_data": result}

    except json.JSONDecodeError as e:
        print(f"⚠️ [SKILL-EXTRACTION] Failed to parse JSON: {str(e)[:100]}")
        return {"skills_data": {}}
    except Exception as e:
        print(f"❌ [SKILL-EXTRACTION] Error: {e}")
        return {"skills_data": {}}

    return {"skills_data": {}}

async def generate_persona_vectors(profile: dict) -> dict:
    """
    Generate vectors for persona fields when entry_mode is 'manual_entry'.
    Returns dict with persona vector fields to update.
    """
    patch = {}

    # Generate current persona vector
    if profile.get("persona_current_text"):
        vec = await build_candidate_vector(profile, profile["persona_current_text"])
        if vec:
            patch["persona_current_vector"] = vec
            print(f"✅ persona_current_vector generated ({len(vec)} dims)")

    # Generate target persona vector
    if profile.get("persona_target_text"):
        vec = await build_candidate_vector(profile, profile["persona_target_text"])
        if vec:
            patch["persona_target_vector"] = vec
            print(f"✅ persona_target_vector generated ({len(vec)} dims)")

    # Generate past persona vectors (1-3)
    for i in range(1, 4):
        text_field = f"persona_past_{i}_text"
        vec_field = f"persona_past_{i}_vector"
        if profile.get(text_field):
            vec = await build_candidate_vector(profile, profile[text_field])
            if vec:
                patch[vec_field] = vec
                print(f"✅ {vec_field} generated ({len(vec)} dims)")

    return patch

@app.post("/webhook/update-profile")
async def webhook_update_profile(req: ProfileUpdateWebhook):
    print(f"📥 [WEBHOOK] Generating candidate vector for user: {req.user_id}")

    has_picture: bool = False
    cv_text = req.cv_text

    try:
        # 1) Fetch profile
        profile_res = (
            supabase.table("candidate_profiles")
            .select("*")
            .eq("user_id", req.user_id)
            .single()
            .execute()
        )

        if not profile_res.data:
            raise HTTPException(404, "Profile not found")

        profile = profile_res.data
        entry_mode = profile.get("entry_mode", "cv_upload")

        # 2) If cv_text missing: download and parse from storage
        if (not cv_text or not cv_text.strip()) and profile.get("cv_bucket_path"):
            path = profile["cv_bucket_path"]
            print(f"📥 [WEBHOOK] CV text empty, downloading: {path}")

            local_path = None
            try:
                from scripts.parse_cv_pdf import (
                    extract_text_from_pdf,
                    extract_text_from_docx,
                    summarize_cv_text,
                )

                data = supabase.storage.from_("cvs").download(path)

                is_pdf = path.lower().endswith(".pdf")
                is_docx = path.lower().endswith(".docx")
                local_ext = ".pdf" if is_pdf else (".docx" if is_docx else ".txt")
                local_path = f"/tmp/temp_{req.user_id}{local_ext}"

                with open(local_path, "wb") as f:
                    f.write(data)

                if is_pdf:
                    raw, has_img_bool = extract_text_from_pdf(local_path)
                    has_picture = bool(has_img_bool)
                    cv_text = summarize_cv_text(raw)
                elif is_docx:
                    raw = extract_text_from_docx(local_path)
                    cv_text = summarize_cv_text(raw)
                    has_picture = False
                else:
                    with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    cv_text = summarize_cv_text(raw)
                    has_picture = False

                print(f"✅ [WEBHOOK] Extracted {len(cv_text) if cv_text else 0} chars. has_picture={has_picture}")

            except Exception as e:
                print(f"⚠️ [WEBHOOK] Storage download/parse failed: {e}")
                raise HTTPException(500, f"Failed to download CV: {str(e)}")

            finally:
                # Always clean temp file if it exists
                try:
                    if local_path and os.path.exists(local_path):
                        os.remove(local_path)
                except Exception:
                    pass

        # 3) Handle empty CV
        if not cv_text or not cv_text.strip():
            # Still store has_picture info if we detected it
            try:
                supabase.table("candidate_profiles").update({
                    "has_picture": has_picture
                }).eq("user_id", req.user_id).execute()
            except Exception as e:
                print(f"⚠️ [WEBHOOK] Failed saving has_picture: {e}")

            print("❌ [WEBHOOK] No CV text available")
            raise HTTPException(400, "No CV text available")

        # 4) Generate vectors based on entry mode
        update_data = {"has_picture": has_picture}

        if entry_mode == "manual_entry":
            print("🎯 [WEBHOOK] Manual entry mode - generating persona vectors...")

            # Generate all persona vectors
            persona_vectors = await generate_persona_vectors(profile)
            update_data.update(persona_vectors)

            # Also generate a combined profile_vector for backward compatibility
            # Combine current + target text for the main profile vector
            combined_text = []
            if profile.get("persona_current_text"):
                combined_text.append(f"Current: {profile['persona_current_text']}")
            if profile.get("persona_target_text"):
                combined_text.append(f"Target: {profile['persona_target_text']}")
            if profile.get("skills_text"):
                combined_text.append(f"Skills: {profile['skills_text']}")
            if profile.get("education_certifications_text"):
                combined_text.append(f"Education: {profile['education_certifications_text']}")

            if combined_text:
                combined = "\n".join(combined_text)
                vector = await build_candidate_vector(profile, combined)
                if vector:
                    update_data["profile_vector"] = vector
                    print(f"✅ profile_vector (combined) generated ({len(vector)} dims)")

                # Store debug text
                debug_preview = combined[:2000]
                debug_text = (
                    f"search_document:\n"
                    f"Candidate: {profile.get('full_name')}\n"
                    f"Manual Entry Preview:\n{debug_preview}"
                )
                update_data["candidate_text_vector"] = debug_text

            print(f"✅ [WEBHOOK] Generated {len(persona_vectors)} persona vectors")

        else:
            # CV upload mode - original behavior
            print("🎯 [WEBHOOK] CV upload mode - generating chunked candidate vector...")
            vector = await build_candidate_vector(profile, cv_text)

            if not vector:
                # still store has_picture
                supabase.table("candidate_profiles").update({
                    "has_picture": has_picture
                }).eq("user_id", req.user_id).execute()

                raise HTTPException(500, "Failed to generate vector")

            # 5) Save to DB (store debug preview, not necessarily exact embed input)
            # Store full cleaned CV text (not a truncated preview). Downstream keyword
            # matching, UI explanations and gap analysis depend on this field.
            stored_cv_text = normalize_cv_text_for_storage(cv_text or "")
            update_data["profile_vector"] = vector
            update_data["candidate_text_vector"] = stored_cv_text

        # 5) Categorize CV for Layer 1 matching
        # Choose text for categorization based on entry mode
        if entry_mode == "manual_entry":
            cat_text = " ".join(filter(None, [
                profile.get("persona_current_text") or "",
                profile.get("persona_target_text") or "",
                profile.get("skills_text") or "",
            ]))
        else:
            cat_text = cv_text

        try:
            # Fast-first categorization to reduce webhook latency and avoid noisy LLM guesses
            # on obvious CVs (e.g. kitchen/cleaning/care).
            final_groups, llm_groups, kw_ranked, cat_source = await resolve_cv_groups(cat_text)
            kw_groups = [g for g, _ in kw_ranked]

            if final_groups:
                update_data["category_tags"] = final_groups
                update_data["primary_occupation_field"] = groups_to_fields(final_groups)
                print(
                    f"🎯 [WEBHOOK] occupation groups source={cat_source} "
                    f"(LLM={len(llm_groups)} kw={len(kw_groups)} final={len(final_groups)}) = {final_groups}"
                )
                if kw_ranked:
                    print(f"🔎 [WEBHOOK] keyword-ranked top={kw_ranked[:5]}")
            else:
                print(f"⚠️ [WEBHOOK] No occupation groups found from LLM or keywords")

        except Exception as e:
            print(f"⚠️ [WEBHOOK] Categorization failed (non-critical): {e}")

        # Save all updates to DB
        supabase.table("candidate_profiles").update(update_data).eq("user_id", req.user_id).execute()

        print(f"✅ [WEBHOOK] Success for {req.user_id}")
        return {"status": "success", "user_id": req.user_id, "entry_mode": entry_mode}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [WEBHOOK] Critical Error: {e}")

        # attempt to store has_picture even on critical error
        try:
            supabase.table("candidate_profiles").update({
                "has_picture": has_picture
            }).eq("user_id", req.user_id).execute()
        except Exception:
            pass

        raise HTTPException(500, str(e))
