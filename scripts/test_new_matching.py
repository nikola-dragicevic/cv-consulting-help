#!/usr/bin/env python3
"""Test new multiple occupation fields matching"""

import os
from supabase import create_client

supabase = create_client(
    "https://glmmegybqtqqahcbdjvz.supabase.co",
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

# Get Lidia's profile
profile = supabase.table("candidate_profiles").select(
    "profile_vector, category_tags, primary_occupation_field, location_lat, location_lon, commute_radius_km"
).eq("email", "dragiceviclidia218@gmail.com").execute()

if not profile.data:
    print("❌ Candidate not found!")
    exit(1)

p = profile.data[0]
print("=" * 80)
print(f"Testing match_jobs_initial with occupation fields:")
print(f"  {p['primary_occupation_field']}")
print("=" * 80)
print()

try:
    # Test with new array parameter
    result = supabase.rpc("match_jobs_initial", {
        "v_profile": p['profile_vector'],
        "u_lat": p['location_lat'],
        "u_lon": p['location_lon'],
        "radius_km": p['commute_radius_km'],
        "top_k": 20,
        "candidate_tags": p['category_tags'],
        "filter_occupation_fields": p['primary_occupation_field']
    }).execute()

    if result.data:
        print(f"✅ SUCCESS! Found {len(result.data)} matches")
        print()
        print("Top 10 matches:")
        for i, job in enumerate(result.data[:10], 1):
            print(f"{i}. {job['headline']}")
    else:
        print("❌ No matches found")

except Exception as e:
    print(f"❌ ERROR: {e}")
    print()
    print("This means the SQL functions have NOT been deployed yet!")
    print("You need to manually apply scripts/match_jobs.sql in Supabase SQL Editor:")
    print("https://glmmegybqtqqahcbdjvz.supabase.co/project/_/sql")
