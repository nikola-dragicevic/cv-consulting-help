import argparse
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
STATE_FILE = SCRIPT_DIR / "job_contact_backfill_state.json"

sys.path.insert(0, str(SCRIPT_DIR))
try:
    from scripts.job_contact_extractor import extract_job_contact_data
except ModuleNotFoundError:
    from job_contact_extractor import extract_job_contact_data

load_dotenv(REPO_ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or service key env vars")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backfill job contact email/application URL/application channel fields.")
    parser.add_argument("--start", type=int, default=None, help="Legacy offset start. Only used to derive an initial cursor once.")
    parser.add_argument("--start-id", type=str, default=None, help="Start after this job id.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of jobs to process in this run.")
    parser.add_argument("--batch-size", type=int, default=200, help="Rows per batch. Default 200.")
    parser.add_argument("--sleep", type=float, default=0.1, help="Pause between batches in seconds.")
    parser.add_argument("--reset-state", action="store_true", help="Ignore saved state and start from 0.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    state = {} if args.reset_state else load_state()

    start = args.start if args.start is not None else int(state.get("next_start", 0))
    last_id = args.start_id if args.start_id is not None else state.get("last_id")
    processed = 0
    updated = 0
    email_count = 0
    channel_counts: dict[str, int] = {}
    batch_size = max(1, int(args.batch_size))
    overall_limit = args.limit

    if start > 0 and not last_id:
        seed = (
            supabase.table("job_ads")
            .select("id")
            .order("id")
            .range(max(0, start - 1), max(0, start - 1))
            .execute()
        )
        seed_rows = seed.data or []
        last_id = seed_rows[0]["id"] if seed_rows else None

    print(
        f"Starting contact backfill from last_id={last_id!r}, legacy_offset={start}, batch_size={batch_size}, limit={overall_limit}"
    )

    while True:
        if overall_limit is not None and processed >= overall_limit:
            break

        effective_batch_size = batch_size
        if overall_limit is not None:
            effective_batch_size = min(effective_batch_size, overall_limit - processed)
            if effective_batch_size <= 0:
                break

        query = (
            supabase.table("job_ads")
            .select("id,description_text,webpage_url,source_snapshot")
            .order("id")
            .limit(effective_batch_size)
        )
        if last_id:
            query = query.gt("id", last_id)

        res = query.execute()
        rows = res.data or []
        if not rows:
            break

        batch = []
        for row in rows:
            contact = extract_job_contact_data(
                description_text=row.get("description_text"),
                webpage_url=row.get("webpage_url"),
                source_snapshot=row.get("source_snapshot"),
            )
            batch.append(
                {
                    "id": row["id"],
                    "contact_email": contact["contact_email"],
                    "has_contact_email": contact["has_contact_email"],
                    "contact_email_source": contact["contact_email_source"],
                    "application_url": contact["application_url"],
                    "application_url_source": contact["application_url_source"],
                    "application_channel": contact["application_channel"],
                    "application_channel_reason": contact["application_channel_reason"],
                }
            )

            processed += 1
            if contact["has_contact_email"]:
                email_count += 1
            channel = contact["application_channel"] or "unknown"
            channel_counts[channel] = channel_counts.get(channel, 0) + 1

        supabase.table("job_ads").upsert(batch, on_conflict="id").execute()
        updated += len(batch)
        start += len(batch)
        last_id = rows[-1]["id"]

        state = {
            "next_start": start,
            "last_id": last_id,
            "last_processed": processed,
            "last_updated": updated,
            "last_email_count": email_count,
            "last_channel_counts": channel_counts,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        save_state(state)

        print(
            f"processed={processed} updated={updated} emails={email_count} channels={channel_counts} next_start={start} last_id={last_id}",
            flush=True,
        )

        time.sleep(max(0.0, float(args.sleep)))

    print("DONE")
    print(
        {
            "processed": processed,
            "updated": updated,
            "emails": email_count,
            "channels": channel_counts,
            "next_start": start,
            "last_id": last_id,
        }
    )


if __name__ == "__main__":
    main()
