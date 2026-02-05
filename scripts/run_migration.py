#!/usr/bin/env python3
"""
Apply SQL migration to create match_jobs_with_occupation_filter function
"""

import os
import sys
from supabase import create_client

def main():
    # Read SQL migration
    migration_path = "/opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql"

    with open(migration_path, 'r') as f:
        sql = f.read()

    # Connect to Supabase
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    print(f"🚀 Applying SQL migration to {url}...")

    supabase = create_client(url, key)

    # Execute SQL using RPC (if available) or show instructions
    try:
        # Try to execute via postgREST (may not work for DDL)
        response = supabase.rpc('exec_sql', {'sql': sql}).execute()
        print("✅ Migration applied successfully!")
        print(response)
    except Exception as e:
        print(f"⚠️  Cannot execute SQL via API (this is normal for DDL commands)")
        print(f"Error: {e}")
        print("\n" + "="*80)
        print("📋 Please apply this SQL manually via Supabase Dashboard:")
        print("="*80)
        print(f"\n1. Go to: {url.replace('https://', 'https://app.supabase.com/project/')}/sql/new")
        print("\n2. Copy and run this SQL:\n")
        print(sql)
        print("\n" + "="*80)

if __name__ == "__main__":
    main()
