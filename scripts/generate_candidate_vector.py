# scripts/generate_candidate_vector.py

import os
import asyncio
import httpx
import json
from supabase import create_client, Client
from dotenv import load_dotenv
from parse_cv_pdf import extract_text_from_pdf, summarize_cv_text

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "bge-base-en")
LOCAL_EMBEDDING_URL = "http://localhost:11434/api/embeddings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def get_local_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient() as client:
        response = await client.post(LOCAL_EMBEDDING_URL, json={
            "model": EMBEDDING_MODEL,
            "prompt": text
        })
        response.raise_for_status()
        return response.json().get("embedding")

def generate_prompt(profile: dict, cv_text: str = "") -> str:
    out = [f"Kandidat: {profile['full_name']} ({profile['email']})"]

    if cv_text:
        out.append(f"CV Sammanfattning: {cv_text}")

    if profile.get("quiz_answers"):
        qa = profile["quiz_answers"]
        for key, val in qa.items():
            if isinstance(val, list):
                val = ", ".join(val)
            out.append(f"{key}: {val}")

    if profile.get("additional_info"):
        out.append(f"Extra info: {profile['additional_info']}")

    return "\n".join(out)

async def enrich_candidates():
    response = supabase.table("candidate_profiles").select("*").filter("vector", "is", "null").execute()
    candidates = response.data

    if not candidates:
        print("✅ No candidates to enrich.")
        return

    for candidate in candidates:
        print(f"Embedding: {candidate['full_name']} ({candidate['email']})")

        cv_summary = ""
        if candidate.get("cv_file_url"):
            file_name = candidate["cv_file_url"].split("cvs/")[-1]
            local_path = os.path.join("./downloads", file_name)
            try:
                os.makedirs("./downloads", exist_ok=True)
                signed = supabase.storage.from_("cvs").create_signed_url(file_name, 60 * 60)
                signed_url = signed.get("signedURL") or signed.get("signed_url") or signed.get("signedUrl")
                print(f"🔗 Signed URL: {signed_url}")

                if not signed_url:
                    raise Exception("❌ Could not generate signed URL")

                print(f"📄 Downloading CV from signed URL: {signed_url}")
                async with httpx.AsyncClient() as client:
                    response = await client.get(signed_url)
                    if response.status_code != 200:
                        raise Exception(f"Supabase download failed: {response.status_code}")

                    with open(local_path, "wb") as f:
                        f.write(response.content)

                raw_cv = extract_text_from_pdf(local_path)
                cv_summary = summarize_cv_text(raw_cv)

            except Exception as e:
                print(f"⚠️ Failed to parse CV: {e}")
                os.makedirs("logs", exist_ok=True)
                with open("logs/failed_candidates.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps({
                        "id": candidate["id"],
                        "full_name": candidate["full_name"],
                        "email": candidate["email"],
                        "error": str(e),
                    }) + "\n")

        prompt = generate_prompt(candidate, cv_summary)
        try:
            vector = await get_local_embedding(prompt)
            if vector and len(vector) == 768:
                supabase.table("candidate_profiles").update({"vector": vector}).eq("id", candidate["id"]).execute()
                print("✅ Saved vector.")
            else:
                print("❌ Invalid vector length.")
        except Exception as e:
            print(f"❌ Error embedding candidate {candidate['id']}: {e}")
            os.makedirs("logs", exist_ok=True)
            with open("logs/failed_candidates.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "id": candidate["id"],
                    "full_name": candidate["full_name"],
                    "email": candidate["email"],
                    "error": str(e),
                }) + "\n")

if __name__ == "__main__":
    asyncio.run(enrich_candidates())
