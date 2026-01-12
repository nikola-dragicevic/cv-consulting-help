# scripts/backfill_category_tags.py
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

env_map_path = os.getenv("CATEGORY_MAP_PATH")

candidates = []
if env_map_path:
    candidates.append(Path(env_map_path))

candidates += [
    REPO_ROOT / "config" / "category_map.json",
    REPO_ROOT / "src" / "app" / "config" / "category_map.json",
    REPO_ROOT / "app" / "config" / "category_map.json",
]

CATEGORY_MAP_PATH = next((p for p in candidates if p.exists()), None)
if not CATEGORY_MAP_PATH:
    raise SystemExit("❌ category_map.json not found. Tried:\n" + "\n".join(str(p) for p in candidates))

CATEGORY_MAP = json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))
print(f"✅ Loaded category map: {CATEGORY_MAP_PATH}")

# Resume file next to this script
RESUME_FILE = SCRIPT_DIR / "backfill_category_tags_resume.json"


def compute_category_tags(field: str, group: str, role: str) -> List[str]:
    field_l = (field or "").lower()
    group_l = (group or "").lower()
    role_l = (role or "").lower()

    tags: List[str] = []
    for tag, rules in CATEGORY_MAP.items():
        fields = [x.lower() for x in rules.get("fields", [])]
        groups = [x.lower() for x in rules.get("groups", [])]
        role_contains = [x.lower() for x in rules.get("roles_contains", [])]

        hit = False
        if fields and any(f in field_l for f in fields):
            hit = True
        if groups and any(g in group_l for g in groups):
            hit = True
        if role_contains and any(rc in role_l for rc in role_contains):
            hit = True

        if hit:
            tags.append(tag)

    return sorted(set(tags))


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


def backfill(
    batch_size: int = 500,
    sleep_s: float = 0.05,
    only_active: bool = True,
    include_empty_arrays: bool = True,
    dry_run: bool = False,
) -> None:
    """
    Backfill category_tags for jobs.
    - Reads: id, occupation_field_label, occupation_group_label, occupation_label, job_category, category_tags
    - Writes: id, category_tags (upsert on id)
    - Resumes by last_id cursor.
    """

    last_id = load_resume_cursor()
    total_updated = 0
    total_seen = 0

    print("🚀 Starting backfill_category_tags")
    print(f"   batch_size={batch_size}, only_active={only_active}, include_empty_arrays={include_empty_arrays}, dry_run={dry_run}")
    if last_id:
        print(f"   Resuming after last_id={last_id}")

    while True:
        q = (
            supabase.table("job_ads")
            .select("id,occupation_field_label,occupation_group_label,occupation_label,job_category,category_tags,is_active")
            .order("id", desc=False)
            .limit(batch_size)
        )

        # Resume cursor
        if last_id:
            q = q.gt("id", last_id)

        # Optional: only active rows
        if only_active:
            q = q.eq("is_active", True)

        # Filter rows needing tags:
        # PostgREST supports OR filters; we include null and optionally empty array.
        # Empty array matching can be inconsistent depending on PostgREST version, so null-only still works.
        if include_empty_arrays:
            # category_tags is null OR equals {} (empty array)
            q = q.or_("category_tags.is.null,category_tags.eq.{}")
        else:
            q = q.is_("category_tags", "null")

        resp = q.execute()
        rows = resp.data or []

        if not rows:
            print("✅ Done. No more rows to backfill.")
            break

        total_seen += len(rows)

        updates: List[Dict[str, Any]] = []
        for r in rows:
            jid = r.get("id")
            field = (r.get("occupation_field_label") or "").strip()
            group = (r.get("occupation_group_label") or "").strip()
            role = (r.get("occupation_label") or r.get("job_category") or "").strip()

            tags = compute_category_tags(field, group, role)

            # If no tags matched, you still may want to store an empty array to avoid reprocessing.
            # Here we store [] so the row is "done" and you can audit later.
            updates.append({"id": jid, "category_tags": tags})

        last_id = rows[-1].get("id")
        if last_id:
            save_resume_cursor(last_id)

        if dry_run:
            print(f"🧪 DRY RUN: would upsert {len(updates)} rows. last_id={last_id}")
        else:
            try:
                supabase.table("job_ads").upsert(updates, on_conflict="id").execute()
                total_updated += len(updates)
                print(f"✅ Updated {len(updates)} rows (total_updated={total_updated}). last_id={last_id}")
            except Exception as e:
                print(f"❌ Upsert failed: {e}")
                print("   Keeping resume cursor so you can rerun safely.")
                break

        time.sleep(sleep_s)

    print(f"📊 Summary: total_seen={total_seen}, total_updated={total_updated}")
    print(f"📌 Resume file: {RESUME_FILE}")
    print("   If everything looks good and you don't need resume anymore, you can delete the resume file.")


if __name__ == "__main__":
    # Tune batch_size if you hit timeouts. 200 is super safe.
    backfill(
        batch_size=int(os.getenv("BACKFILL_BATCH_SIZE", "500")),
        sleep_s=float(os.getenv("BACKFILL_SLEEP_S", "0.05")),
        only_active=True,
        include_empty_arrays=True,
        dry_run=False,
    )
