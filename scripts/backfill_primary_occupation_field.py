# scripts/backfill_primary_occupation_field.py
"""
Backfills primary_occupation_field for all candidates based on their category_tags.
This provides a hard filter to ensure candidates only see jobs in their primary field.
"""
import os
import json
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

# Load category map
CATEGORY_MAP_PATH = REPO_ROOT / "config" / "category_map.json"
if not CATEGORY_MAP_PATH.exists():
    raise SystemExit(f"❌ category_map.json not found at {CATEGORY_MAP_PATH}")

CATEGORY_MAP = json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))

# Configuration
BATCH_SIZE = int(os.getenv("BACKFILL_BATCH_SIZE", "50"))
SLEEP_S = float(os.getenv("BACKFILL_SLEEP_S", "0.1"))
FORCE_REBUILD = os.getenv("FORCE_REBUILD_OCCUPATION_FIELD", "0") == "1"


# ---------------- Mapping: Category Tags → Occupation Field ----------------

# This maps our broad category tags to the official occupation_field_label values
# used in job_ads table (from Arbetsförmedlingen API)
CATEGORY_TO_OCCUPATION_FIELD = {
    # IT & Software
    "IT": "Data/IT",
    "Software Development": "Data/IT",

    # Engineering & Industrial
    "Engineering / Tech": "Tekniskt arbete",
    "Automation / Industrial": "Industriell tillverkning",

    # Construction
    "Construction / Infrastructure": "Bygg och anläggning",

    # Logistics & Transport
    "Logistics / Operations": "Transport",

    # Management
    "Management": "Chefer och verksamhetsledare",

    # Business Functions
    "HR": "Administration, ekonomi, juridik",
    "Finance": "Administration, ekonomi, juridik",
    "Legal": "Administration, ekonomi, juridik",
    "Administration": "Administration, ekonomi, juridik",

    # Sales & Marketing
    "Sales / Marketing": "Försäljning, inköp, marknadsföring",

    # Healthcare
    "Healthcare": "Hälso- och sjukvård",

    # Education
    "Education": "Pedagogiskt arbete",

    # Service
    "Service / Hospitality": "Hotell, restaurang, storhushåll",

    # Security
    "Security": "Säkerhetsarbete",

    # Social
    "Social Work": "Socialt arbete",

    # Culture & Media
    "Culture / Media": "Kultur, media, design",

    # Nature
    "Nature / Agriculture": "Naturbruk",
}

# Priority order: some tags are more specific than others
TAG_PRIORITY = [
    "Software Development",  # Most specific IT role
    "IT",
    "Engineering / Tech",
    "Automation / Industrial",
    "Construction / Infrastructure",
    "Logistics / Operations",
    "Finance",
    "Legal",
    "HR",
    "Sales / Marketing",
    "Healthcare",
    "Education",
    "Service / Hospitality",
    "Security",
    "Social Work",
    "Culture / Media",
    "Management",  # Least specific (everyone can be a manager)
    "Administration",
    "Nature / Agriculture",
]


def compute_primary_occupation_field(category_tags: List[str]) -> Optional[str]:
    """
    Given a list of category tags, determine the primary occupation field.

    Strategy:
    1. If candidate has "Software Development" or "IT" → Data/IT (most common use case)
    2. Use priority order to pick the most specific relevant tag
    3. Map the chosen tag to occupation_field_label

    Returns:
        occupation_field_label string or None
    """
    if not category_tags:
        return None

    # Convert to set for fast lookup
    tag_set = set(category_tags)

    # Special case: IT/Software takes precedence (your main use case)
    if "Software Development" in tag_set or "IT" in tag_set:
        return "Data/IT"

    # Find the highest priority tag present
    for priority_tag in TAG_PRIORITY:
        if priority_tag in tag_set:
            return CATEGORY_TO_OCCUPATION_FIELD.get(priority_tag)

    # Fallback: use first tag in alphabetical order
    first_tag = sorted(category_tags)[0]
    return CATEGORY_TO_OCCUPATION_FIELD.get(first_tag)


def should_update(candidate: Dict[str, Any]) -> bool:
    """Check if we should update this candidate."""
    if FORCE_REBUILD:
        return True

    # Only update if primary_occupation_field is null/empty
    existing = (candidate.get("primary_occupation_field") or "").strip()
    return not existing


# ---------------- Main Backfill Loop ----------------

def backfill():
    print("🚀 Backfilling primary_occupation_field for candidates")
    print(f"   BATCH_SIZE={BATCH_SIZE}, FORCE_REBUILD={FORCE_REBUILD}")

    total_seen = 0
    total_updated = 0
    total_skipped = 0

    offset = 0

    while True:
        # Fetch batch
        query = (
            supabase.table("candidate_profiles")
            .select("id, user_id, email, full_name, category_tags, primary_occupation_field")
            .order("id", desc=False)
            .range(offset, offset + BATCH_SIZE - 1)
        )

        resp = query.execute()
        rows = resp.data or []

        if not rows:
            print("✅ Done. No more rows.")
            break

        total_seen += len(rows)

        updates: List[Dict[str, Any]] = []

        for candidate in rows:
            cid = candidate.get("id")
            email = candidate.get("email") or candidate.get("user_id") or "unknown"
            tags = candidate.get("category_tags") or []

            if not should_update(candidate):
                total_skipped += 1
                continue

            # Compute primary field
            primary_field = compute_primary_occupation_field(tags)

            if not primary_field:
                print(f"⚠️  {email}: No category tags, skipping")
                total_skipped += 1
                continue

            print(f"✅ {email}: tags={tags} → primary_field='{primary_field}'")

            updates.append({
                "id": cid,
                "primary_occupation_field": primary_field
            })

        # Batch update
        if updates:
            try:
                supabase.table("candidate_profiles").upsert(updates, on_conflict="id").execute()
                total_updated += len(updates)
                print(f"💾 Updated {len(updates)} candidates. Total updated: {total_updated}")
            except Exception as e:
                print(f"❌ Batch update failed: {e}")
                print("   Continuing to next batch...")

        offset += BATCH_SIZE

        if SLEEP_S > 0:
            time.sleep(SLEEP_S)

    print("\n" + "="*60)
    print("📊 SUMMARY")
    print("="*60)
    print(f"Total candidates seen:    {total_seen}")
    print(f"Total updated:            {total_updated}")
    print(f"Total skipped:            {total_skipped}")
    print("="*60)


if __name__ == "__main__":
    backfill()
