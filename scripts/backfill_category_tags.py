# scripts/backfill_category_tags.py
import os
import json
import time
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Set
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

# ---------------- Config ----------------
MODE = os.getenv("BACKFILL_MODE", "missing").lower()  # "missing" or "all"
ONLY_ACTIVE = os.getenv("BACKFILL_ONLY_ACTIVE", "true").lower() == "true"
BATCH_SIZE = int(os.getenv("BACKFILL_BATCH_SIZE", "500"))
SLEEP_S = float(os.getenv("BACKFILL_SLEEP_S", "0.05"))

# Load Category Map
candidates = [
    REPO_ROOT / "config" / "category_map.json",
    REPO_ROOT / "src" / "app" / "config" / "category_map.json",
    REPO_ROOT / "app" / "config" / "category_map.json",
]
CATEGORY_MAP_PATH = next((p for p in candidates if p.exists()), None)
if not CATEGORY_MAP_PATH:
    raise SystemExit("❌ category_map.json not found.")

CATEGORY_MAP = json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))
print(f"✅ Loaded category map: {CATEGORY_MAP_PATH}")

# Resume file
RESUME_FILE = SCRIPT_DIR / "backfill_category_tags_resume.json"


# ---------------- Helpers ----------------
def _safe_json(obj: Any) -> Dict[str, Any]:
    """Supabase may return JSONB as dict, or as string sometimes; normalize to dict."""
    if not obj:
        return {}
    if isinstance(obj, dict):
        return obj
    if isinstance(obj, str):
        try:
            v = json.loads(obj)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}
    return {}

def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s

def _contains_any(hay: str, needles: List[str]) -> bool:
    """Substring match with normalized strings."""
    if not hay or not needles:
        return False
    hay = _norm(hay)
    for n in needles:
        nn = _norm(n)
        if nn and nn in hay:
            return True
    return False

def _word_hit(text: str, keyword: str) -> bool:
    """Safer keyword hit using word boundaries for 'full_text' (prevents crazy partial matches)."""
    if not text or not keyword:
        return False
    kw = _norm(keyword)
    if len(kw) < 3:
        return False
    # word boundary-ish: allow Swedish letters too
    pattern = r"(^|[^a-zåäö0-9])" + re.escape(kw) + r"([^a-zåäö0-9]|$)"
    return re.search(pattern, _norm(text), flags=re.IGNORECASE) is not None


def compute_tags_smart(job: Dict[str, Any]) -> List[str]:
    tags: Set[str] = set()

    # 1) Structured AF taxonomy (strong signals)
    occ_field = _safe_json(job.get("occupation_field"))
    occ_group = _safe_json(job.get("occupation_group"))

    field_label = _norm(occ_field.get("label") or "")
    group_label = _norm(occ_group.get("label") or "")

    # 2) Text fallback
    headline = _norm(job.get("headline") or "")
    desc = job.get("description_text") or ""
    full_text = f"{headline}\n{desc}"

    for tag, rules in CATEGORY_MAP.items():
        rule_fields = rules.get("fields", []) or []
        rule_groups = rules.get("groups", []) or []
        role_keywords = rules.get("roles_contains", []) or []

        # Rule A: field/group contains (NOT equals)
        if field_label and _contains_any(field_label, rule_fields):
            tags.add(tag)
            continue
        if group_label and _contains_any(group_label, rule_groups):
            tags.add(tag)
            continue

        # Rule B: headline keyword (strong)
        hit = False
        for kw in role_keywords:
            if kw and _word_hit(headline, kw):
                hit = True
                break
        if hit:
            tags.add(tag)
            continue

        # Rule C: full text keyword (weaker but still useful)
        for kw in role_keywords:
            if kw and _word_hit(full_text, kw):
                tags.add(tag)
                break

    return sorted(tags)


def load_resume_cursor() -> Optional[str]:
    if RESUME_FILE.exists():
        try:
            data = json.loads(RESUME_FILE.read_text(encoding="utf-8"))
            return data.get("last_id")
        except Exception:
            return None
    return None

def save_resume_cursor(last_id: str) -> None:
    RESUME_FILE.write_text(json.dumps({"last_id": last_id}), encoding="utf-8")

def clear_resume_cursor() -> None:
    if RESUME_FILE.exists():
        RESUME_FILE.unlink()


# ---------------- Main ----------------
def backfill():
    last_id = load_resume_cursor()
    total_seen = 0
    total_updated = 0

    print("🚀 Starting Smart Backfill")
    print(f"   MODE={MODE} (missing|all), ONLY_ACTIVE={ONLY_ACTIVE}, BATCH_SIZE={BATCH_SIZE}")
    if last_id:
        print(f"⏩ Resuming after last_id={last_id}")

    while True:
        q = (
            supabase.table("job_ads")
            .select("id, headline, description_text, occupation_field, occupation_group, category_tags, is_active")
            .order("id", desc=False)
            .limit(BATCH_SIZE)
        )

        if last_id:
            q = q.gt("id", last_id)

        if ONLY_ACTIVE:
            q = q.eq("is_active", True)

        if MODE == "missing":
            # only rows with NULL or empty array
            q = q.or_("category_tags.is.null,category_tags.eq.{}")

        resp = q.execute()
        rows = resp.data or []

        if not rows:
            print("✅ Done. No more rows.")
            clear_resume_cursor()
            break

        updates: List[Dict[str, Any]] = []

        for row in rows:
            old_tags = row.get("category_tags") or []
            if old_tags is None:
                old_tags = []

            new_tags = compute_tags_smart(row)

            # Update if changed OR if MODE=missing and tags were null/empty
            if set(new_tags) != set(old_tags):
                updates.append({"id": row["id"], "category_tags": new_tags})

        if updates:
            try:
                supabase.table("job_ads").upsert(updates, on_conflict="id").execute()
                total_updated += len(updates)
                print(f"💾 Updated {len(updates)} rows. total_updated={total_updated}")
            except Exception as e:
                print(f"❌ Batch upsert failed: {e}")
                print("   Keeping cursor; retrying after 5s.")
                time.sleep(5)
                continue
        else:
            print(f"⏩ No changes needed for this batch of {len(rows)}.")

        total_seen += len(rows)
        last_id = rows[-1]["id"]
        save_resume_cursor(last_id)

        time.sleep(SLEEP_S)

    print(f"📊 Summary: total_seen={total_seen}, total_updated={total_updated}")


if __name__ == "__main__":
    backfill()
