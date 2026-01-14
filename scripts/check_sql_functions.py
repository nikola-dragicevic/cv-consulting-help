#!/usr/bin/env python3
"""Check if SQL functions are deployed with correct signatures"""

import os
from supabase import create_client

supabase = create_client(
    "https://glmmegybqtqqahcbdjvz.supabase.co",
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

print("=" * 80)
print("CHECKING SQL FUNCTION SIGNATURES")
print("=" * 80)
print()

# Try calling with array parameter (new signature)
print("1️⃣ Testing match_jobs_initial with TEXT[] parameter...")
try:
    result = supabase.rpc("match_jobs_initial", {
        "v_profile": [0.1] * 768,
        "u_lat": 59.3293,
        "u_lon": 18.0686,
        "radius_km": 40,
        "top_k": 1,
        "candidate_tags": ["Service / Hospitality"],
        "filter_occupation_fields": ["Hotell, restaurang, storhushåll"]  # ARRAY
    }).execute()
    print("✅ SUCCESS - Function accepts TEXT[] parameter")
    print(f"   Returned {len(result.data) if result.data else 0} jobs")
except Exception as e:
    print(f"❌ FAILED - {e}")
    print("   The SQL functions need to be deployed!")
    print()

print()
print("2️⃣ Testing with single TEXT parameter (old signature)...")
try:
    result = supabase.rpc("match_jobs_initial", {
        "v_profile": [0.1] * 768,
        "u_lat": 59.3293,
        "u_lon": 18.0686,
        "radius_km": 40,
        "top_k": 1,
        "candidate_tags": ["Service / Hospitality"],
        "filter_occupation_field": "Hotell, restaurang, storhushåll"  # STRING
    }).execute()
    print("⚠️  OLD SIGNATURE STILL EXISTS")
    print("   This means Supabase has BOTH old and new functions")
    print(f"   Returned {len(result.data) if result.data else 0} jobs")
except Exception as e:
    print(f"✅ Old signature removed: {e}")

print()
print("=" * 80)
print("CONCLUSION")
print("=" * 80)

print("""
If test 1 failed:
  → You need to deploy scripts/match_jobs.sql to Supabase SQL Editor
  → URL: https://glmmegybqtqqahcbdjvz.supabase.co/project/_/sql

If both tests passed:
  → Check browser cache (open incognito)
  → Verify user is actually logged in
  → Check browser console for errors
""")
