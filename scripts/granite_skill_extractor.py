#!/usr/bin/env python3
"""
Layer 4: The Auditor - Automated Skill Gap Analysis
Extracts required and preferred skills from job descriptions using llama3.2
Stores results in skills_data JSONB column for frontend comparison

Usage:
    python scripts/granite_skill_extractor.py          # Process jobs missing skills_data
    python scripts/granite_skill_extractor.py --all    # Process all jobs
"""

import os
import sys
import json
import time
import httpx
from typing import Dict, List, Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_GENERATE_URL = os.getenv("OLLAMA_GENERATE_URL", "http://ollama:11434/api/generate")
EXTRACTION_MODEL = os.getenv("EXTRACTION_MODEL", "llama3.2:3b")

BATCH_SIZE = 50
DELAY_BETWEEN_BATCHES = 2  # seconds

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def extract_skills_with_llm(job_description: str) -> Optional[Dict]:
    """
    Layer 4: Extract skills using local LLM (llama3.2)
    Returns: {"required_skills": [...], "preferred_skills": [...]}
    """
    if not job_description or len(job_description.strip()) < 50:
        return None

    # Truncate very long descriptions
    desc_text = job_description[:3000]

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
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                OLLAMA_GENERATE_URL,
                json={
                    "model": EXTRACTION_MODEL,
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

                return {
                    "required_skills": required[:15],  # Max 15 each
                    "preferred_skills": preferred[:15]
                }

    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse JSON: {str(e)[:100]}")
        return None
    except Exception as e:
        print(f"❌ Extraction error: {e}")
        return None

    return None


def process_jobs(process_all: bool = False):
    """
    Process jobs and extract skills using Layer 4
    """
    print("🚀 Layer 4: Automated Skill Gap Analysis")
    print(f"Mode: {'Process all jobs' if process_all else 'Process jobs missing skills_data'}")

    # Fetch jobs to process
    query = supabase.table("job_ads").select("id, description, title")

    if not process_all:
        # Only process jobs where skills_data is empty or null
        query = query.or_("skills_data.is.null,skills_data.eq.{}")

    query = query.eq("removed", False).limit(1000)

    result = query.execute()
    jobs = result.data

    if not jobs:
        print("✅ No jobs to process")
        return

    total = len(jobs)
    print(f"📊 Found {total} jobs to process")

    processed = 0
    failed = 0
    skipped = 0

    for i in range(0, total, BATCH_SIZE):
        batch = jobs[i:i + BATCH_SIZE]
        print(f"\n📦 Processing batch {i // BATCH_SIZE + 1} ({i + 1}-{min(i + BATCH_SIZE, total)} of {total})")

        for job in batch:
            job_id = job["id"]
            description = job.get("description", "")
            title = job.get("title", "Unknown")

            if not description or len(description.strip()) < 50:
                print(f"⏭️ Skipping job {job_id} (no description)")
                skipped += 1
                continue

            # Extract skills
            skills_data = extract_skills_with_llm(description)

            if skills_data:
                # Save to database
                try:
                    supabase.table("job_ads").update({
                        "skills_data": skills_data
                    }).eq("id", job_id).execute()

                    processed += 1
                    req_count = len(skills_data.get("required_skills", []))
                    pref_count = len(skills_data.get("preferred_skills", []))
                    print(f"✅ Job {job_id}: {title[:50]} - Req: {req_count}, Pref: {pref_count}")

                except Exception as e:
                    print(f"❌ Failed to save job {job_id}: {e}")
                    failed += 1
            else:
                print(f"⚠️ Failed to extract skills for job {job_id}")
                failed += 1

            # Small delay to avoid overwhelming Ollama
            time.sleep(0.1)

        # Delay between batches
        if i + BATCH_SIZE < total:
            print(f"⏸️ Sleeping {DELAY_BETWEEN_BATCHES}s between batches...")
            time.sleep(DELAY_BETWEEN_BATCHES)

    print(f"\n🏁 Complete! Processed: {processed}, Failed: {failed}, Skipped: {skipped}")


if __name__ == "__main__":
    process_all = "--all" in sys.argv
    process_jobs(process_all)
