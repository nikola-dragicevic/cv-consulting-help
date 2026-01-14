#!/usr/bin/env python3
"""Check candidate_profiles schema"""

import os
from supabase import create_client, Client

url = os.environ.get("SUPABASE_URL", "https://glmmegybqtqqahcbdjvz.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# Get one row to see available columns
try:
    result = supabase.table("candidate_profiles").select("*").limit(1).execute()
    if result.data:
        print("Available columns in candidate_profiles:")
        for col in sorted(result.data[0].keys()):
            print(f"  - {col}")
    else:
        print("No data in candidate_profiles")
except Exception as e:
    print(f"Error: {e}")
