import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

load_dotenv(REPO_ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or service key env vars")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit jobs marked external_apply even though the description contains '@'."
    )
    parser.add_argument("--limit", type=int, default=50, help="How many suspicious rows to print. Default 50.")
    parser.add_argument(
        "--only-active",
        action="store_true",
        help="Only inspect active jobs.",
    )
    parser.add_argument(
        "--scan-limit",
        type=int,
        default=5000,
        help="How many external_apply rows to scan for suspicious '@' descriptions. Default 5000.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="Rows per batch during audit scan. Default 200.",
    )
    return parser


def shorten(text: str | None, max_len: int = 220) -> str:
    value = (text or "").replace("\r", " ").replace("\n", " ").strip()
    if len(value) <= max_len:
        return value
    return value[: max_len - 3] + "..."


def main() -> None:
    args = build_parser().parse_args()

    suspicious_rows: list[dict] = []
    suspicious_count = 0
    scanned = 0
    last_id = None

    while scanned < max(1, args.scan_limit):
        effective_batch_size = min(max(1, args.batch_size), max(1, args.scan_limit) - scanned)
        query = (
            supabase.table("job_ads")
            .select(
                "id,headline,company,city,is_active,application_channel,application_channel_reason,"
                "contact_email,contact_email_source,application_url,application_url_source,description_text"
            )
            .eq("application_channel", "external_apply")
            .order("id")
            .limit(effective_batch_size)
        )
        if args.only_active:
            query = query.eq("is_active", True)
        if last_id:
            query = query.gt("id", last_id)

        response = query.execute()
        batch = response.data or []
        if not batch:
            break

        scanned += len(batch)
        last_id = batch[-1]["id"]

        for row in batch:
            description = row.get("description_text") or ""
            if "@" not in description:
                continue
            suspicious_count += 1
            if len(suspicious_rows) < max(1, args.limit):
                suspicious_rows.append(row)

    print(
        json.dumps(
            {
                "suspicious_external_apply_with_at_count_in_scanned_rows": suspicious_count,
                "sample_size": len(suspicious_rows),
                "only_active": args.only_active,
                "scanned_rows": scanned,
                "scan_limit": args.scan_limit,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    for idx, row in enumerate(suspicious_rows, start=1):
        print(f"\n[{idx}] {row.get('headline') or 'Untitled'}")
        print(
            json.dumps(
                {
                    "id": row.get("id"),
                    "company": row.get("company"),
                    "city": row.get("city"),
                    "is_active": row.get("is_active"),
                    "application_channel": row.get("application_channel"),
                    "application_channel_reason": row.get("application_channel_reason"),
                    "contact_email": row.get("contact_email"),
                    "contact_email_source": row.get("contact_email_source"),
                    "application_url": row.get("application_url"),
                    "application_url_source": row.get("application_url_source"),
                    "description_excerpt": shorten(row.get("description_text")),
                },
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
