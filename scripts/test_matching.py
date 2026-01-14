#!/usr/bin/env python3
"""Test the matching for Lidia Dragicevic"""

import os
from supabase import create_client, Client

url = os.environ.get("SUPABASE_URL", "https://glmmegybqtqqahcbdjvz.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# Get Lidia's profile
print("=" * 80)
print("TESTING JOB MATCHING FOR LIDIA DRAGICEVIC")
print("=" * 80)

profile = supabase.table("candidate_profiles").select(
    "email, category_tags, primary_occupation_field, profile_vector, location_lat, location_lon, commute_radius_km"
).eq("email", "dragiceviclidia218@gmail.com").execute()

if not profile.data:
    print("❌ Candidate not found!")
    exit(1)

p = profile.data[0]
print(f"\n✅ Candidate Profile:")
print(f"   Email: {p['email']}")
print(f"   Category Tags: {p['category_tags']}")
print(f"   Primary Occupation Field: {p['primary_occupation_field']}")
print(f"   Location: ({p['location_lat']}, {p['location_lon']})")
print(f"   Commute Radius: {p['commute_radius_km']} km")

# Call the matching function
print(f"\n🔍 Calling match_jobs_initial with occupation filter...")
print(f"   Filter: {p['primary_occupation_field']}")

try:
    result = supabase.rpc("match_jobs_initial", {
        "v_profile": p['profile_vector'],
        "u_lat": p['location_lat'],
        "u_lon": p['location_lon'],
        "radius_km": p['commute_radius_km'],
        "top_k": 20,
        "candidate_tags": p['category_tags'],
        "filter_occupation_field": p['primary_occupation_field']
    }).execute()

    if result.data:
        print(f"\n📊 Found {len(result.data)} matches:")
        print("\nTop 10 matches:")
        for i, job in enumerate(result.data[:10], 1):
            print(f"\n{i}. {job['headline']}")
            print(f"   Location: {job['location']}")
            print(f"   Profile Match: {job['s_profile']:.2%}")
    else:
        print("\n❌ No matches found!")

except Exception as e:
    print(f"\n❌ Error calling match_jobs_initial: {e}")
    print("\n⚠️  This likely means the SQL functions need to be updated in Supabase.")
    print("   Please run the SQL from scripts/match_jobs.sql in the Supabase SQL Editor:")
    print(f"   {url}/project/_/sql")
