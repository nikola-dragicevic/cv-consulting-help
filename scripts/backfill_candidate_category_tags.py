import os, json, time
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Reuse same map as jobs
CATEGORY_MAP_PATH = Path("/app/config/category_map.json")
if not CATEGORY_MAP_PATH.exists():
    # fallback for local run
    CATEGORY_MAP_PATH = Path(__file__).resolve().parent.parent / "config" / "category_map.json"
if not CATEGORY_MAP_PATH.exists():
    raise SystemExit(f"❌ Missing category map file: {CATEGORY_MAP_PATH}")

CATEGORY_MAP = json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))

def compute_candidate_tags(text: str) -> List[str]:
    t = (text or "").lower()
    tags = set()

    for tag, rules in CATEGORY_MAP.items():
        # candidate: we mainly match using roles_contains words as keywords
        role_contains = [x.lower() for x in rules.get("roles_contains", [])]
        fields = [x.lower() for x in rules.get("fields", [])]
        groups = [x.lower() for x in rules.get("groups", [])]

        hit = False
        if role_contains and any(k in t for k in role_contains):
            hit = True
        # allow field/group words as keywords too (helps)
        if fields and any(k in t for k in fields):
            hit = True
        if groups and any(k in t for k in groups):
            hit = True

        if hit:
            tags.add(tag)

    return sorted(tags)

def run(batch_size: int = 200, sleep_s: float = 0.05):
    total = 0
    offset = 0

    while True:
        resp = (
            supabase.table("candidate_profiles")
            .select("id,candidate_text_vector,wish_text_vector,category_tags")
            .is_("category_tags", "null")
            .order("created_at", desc=False)
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            print("✅ Done. No more candidates missing tags.")
            break

        updates = []
        for r in rows:
            combined = (r.get("candidate_text_vector") or "") + "\n" + (r.get("wish_text_vector") or "")
            tags = compute_candidate_tags(combined)
            updates.append({"id": r["id"], "category_tags": tags})

        supabase.table("candidate_profiles").upsert(updates, on_conflict="id").execute()
        total += len(updates)
        print(f"✅ Updated {len(updates)} candidates (total={total})")

        offset += batch_size
        time.sleep(sleep_s)

if __name__ == "__main__":
    run()
