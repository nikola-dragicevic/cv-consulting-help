# scripts/generate_candidate_vector.py

import os
import asyncio
import httpx
import json
from supabase import create_client, Client
from dotenv import load_dotenv
from parse_cv_pdf import extract_text_from_pdf, summarize_cv_text

# Load env variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
LOCAL_EMBEDDING_URL = "http://localhost:11434/api/embeddings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def get_local_embedding(text: str) -> list[float]:
    """Send text to Ollama and get embedding."""
    async with httpx.AsyncClient() as client:
        response = await client.post(LOCAL_EMBEDDING_URL, json={
            "model": EMBEDDING_MODEL,
            "prompt": text
        })
        response.raise_for_status()
        return response.json().get("embedding")

def generate_prompt(profile: dict, cv_text: str = "") -> str:
    """Generate descriptive text from quiz + CV for embedding."""
    out = [f"Kandidat: {profile['full_name']} ({profile['email']})"]

    if cv_text:
        out.append(f"CV Sammanfattning: {cv_text}")

    if profile.get("quiz_answers"):
        for key, val in profile["quiz_answers"].items():
            if isinstance(val, list):
                val = ", ".join(val)
            out.append(f"{key}: {val}")

    if profile.get("additional_info"):
        out.append(f"Extra info: {profile['additional_info']}")

    return "\n".join(out)

async def enrich_candidates():
    """Fetch candidates without vectors and enrich them."""
    os.makedirs("logs", exist_ok=True)
    failed_path = "logs/failed_candidates.jsonl"

    print(f"📦 Using embedding model: {EMBEDDING_MODEL}")
    print(f"🔗 Supabase URL: {SUPABASE_URL}")
    print("🚀 Starting candidate vectorization...")

    response = supabase.table("candidate_profiles").select("*").filter("vector", "is", "null").execute()
    candidates = response.data

    if not candidates:
        print("✅ No candidates to enrich.")
        return

    print(f"📋 Found {len(candidates)} candidates to process...")

    for idx, candidate in enumerate(candidates, start=1):
        print(f"\n[{idx}/{len(candidates)}] Embedding: {candidate['full_name']} ({candidate['email']})")

        cv_summary = ""
        if candidate.get("cv_file_url"):
            file_name = candidate["cv_file_url"].split("cvs/")[-1]
            local_path = os.path.join("./downloads", file_name)
            try:
                os.makedirs("./downloads", exist_ok=True)
                signed = supabase.storage.from_("cvs").create_signed_url(file_name, 60 * 60)
                signed_url = signed.get("signedURL") or signed.get("signed_url") or signed.get("signedUrl")

                if not signed_url:
                    raise Exception("Could not generate signed URL")

                print(f"🔗 Signed URL: {signed_url}")
                print(f"📄 Downloading CV from signed URL...")

                async with httpx.AsyncClient() as client:
                    dl_response = await client.get(signed_url)
                    if dl_response.status_code != 200:
                        raise Exception(f"Supabase download failed: {dl_response.status_code}")

                    with open(local_path, "wb") as f:
                        f.write(dl_response.content)

                raw_cv = extract_text_from_pdf(local_path)
                cv_summary = summarize_cv_text(raw_cv)

            except Exception as e:
                print(f"⚠️ Failed to parse CV: {e}")
                with open(failed_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({
                        "id": candidate["id"],
                        "full_name": candidate["full_name"],
                        "email": candidate["email"],
                        "error": str(e),
                    }) + "\n")
                continue

        # Create embedding
        prompt = generate_prompt(candidate, cv_summary)
        try:
            vector = await get_local_embedding(prompt)
            if vector:
                supabase.table("candidate_profiles").update({"vector": vector}).eq("id", candidate["id"]).execute()
                print(f"✅ Saved vector ({len(vector)} dims).")
            else:
                raise ValueError("No embedding returned.")
        except Exception as e:
            print(f"❌ Error embedding candidate {candidate['id']}: {e}")
            with open(failed_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "id": candidate["id"],
                    "full_name": candidate["full_name"],
                    "email": candidate["email"],
                    "error": str(e),
                }) + "\n")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())
