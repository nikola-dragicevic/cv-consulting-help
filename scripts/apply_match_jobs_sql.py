#!/usr/bin/env python3
"""
Apply match_jobs.sql to Supabase database using the PostgREST client.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")

SCRIPT_DIR = Path(__file__).resolve().parent
SQL_FILE = SCRIPT_DIR / "match_jobs.sql"

if not SQL_FILE.exists():
    raise SystemExit(f"❌ SQL file not found: {SQL_FILE}")

print("📋 Reading SQL file...")
sql_content = SQL_FILE.read_text(encoding="utf-8")

print("🔌 Connecting to Supabase...")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("⚙️  Applying SQL changes...")
try:
    # Execute the SQL using Supabase RPC
    # Note: This requires the SQL to be executed via direct database connection
    # Since Supabase Python client doesn't support raw SQL execution directly,
    # we need to use the underlying connection

    # For now, let's provide instructions
    print("\n" + "="*70)
    print("⚠️  SQL cannot be applied directly via Python client.")
    print("="*70)
    print("\nPlease apply the SQL manually using one of these methods:")
    print("\n1. Via Supabase Dashboard:")
    print("   - Go to: https://app.supabase.com/project/[your-project]/sql")
    print(f"   - Copy the content of: {SQL_FILE}")
    print("   - Paste and run the SQL")
    print("\n2. Via psql command line:")
    print("   - Get your database connection string from Supabase dashboard")
    print(f"   - Run: psql [CONNECTION_STRING] -f {SQL_FILE}")
    print("\n3. Via Supabase CLI:")
    print(f"   - Run: supabase db execute -f {SQL_FILE}")
    print("="*70)

except Exception as e:
    print(f"❌ Error: {e}")
    raise SystemExit(1)
