#!/usr/bin/env python3
"""Deploy SQL functions to Supabase"""

import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase
url = os.environ.get("SUPABASE_URL", "https://glmmegybqtqqahcbdjvz.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not key:
    print("❌ SUPABASE_SERVICE_ROLE_KEY not found")
    sys.exit(1)

supabase: Client = create_client(url, key)

# Read SQL file
sql_file = "scripts/match_jobs.sql"
print(f"📖 Reading {sql_file}...")
with open(sql_file, 'r') as f:
    sql_content = f.read()

print(f"✅ Loaded {len(sql_content)} characters of SQL")
print("\n" + "=" * 80)
print("🚀 DEPLOYING SQL FUNCTIONS TO SUPABASE")
print("=" * 80)

try:
    # Execute the SQL
    result = supabase.rpc("exec_sql", {"sql": sql_content}).execute()
    print("✅ SQL functions deployed successfully!")
    print(f"Result: {result}")
except Exception as e:
    print(f"❌ Failed to deploy SQL functions: {e}")
    print("\n📝 You need to manually apply the SQL from scripts/match_jobs.sql")
    print("   to your Supabase database via the SQL Editor in the dashboard:")
    print(f"   {url}/project/_/sql")
    sys.exit(1)
