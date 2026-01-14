#!/usr/bin/env python3
"""Diagnose why Lidia is getting mixed results"""

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

p = profile.data[0]

print("=" * 80)
print("LIDIA'S PROFILE")
print("=" * 80)
print(f"Category Tags: {p['primary_occupation_field']}")
print(f"Occupation Fields: {p['primary_occupation_field']}")
print()

# Call matching function
result = supabase.rpc("match_jobs_initial", {
    "v_profile": p['profile_vector'],
    "u_lat": p['location_lat'],
    "u_lon": p['location_lon'],
    "radius_km": p['commute_radius_km'],
    "top_k": 50,
    "candidate_tags": p['category_tags'],
    "filter_occupation_fields": p['primary_occupation_field']
}).execute()

jobs = result.data

# Categorize jobs
restaurant_cleaning = []
managers = []
tech = []
other = []

for job in jobs:
    title = job['headline'].lower()
    if any(word in title for word in ['clean', 'städ', 'lokalvård', 'kök', 'servic', 'bronck', 'bar', 'restaurang']):
        restaurant_cleaning.append(job)
    elif any(word in title for word in ['manager', 'chef', 'lead', 'head', 'director']):
        managers.append(job)
    elif any(word in title for word in ['engineer', 'developer', 'analyst', 'data', 'software', 'java', 'backend']):
        tech.append(job)
    else:
        other.append(job)

print("=" * 80)
print("JOB DISTRIBUTION")
print("=" * 80)
print(f"✅ Restaurant/Cleaning: {len(restaurant_cleaning)}")
print(f"❌ Managers: {len(managers)}")
print(f"❌ Tech/IT: {len(tech)}")
print(f"❌ Other: {len(other)}")
print()

# Check occupation fields of "bad" matches
print("=" * 80)
print("CHECKING 'BAD' MATCHES")
print("=" * 80)

bad_matches = managers[:5] + tech[:5]

for job in bad_matches:
    job_id = job['id']

    # Get full job details
    full_job = supabase.table("job_ads").select(
        "headline, occupation_field_label, category_tags"
    ).eq("id", job_id).execute()

    if full_job.data:
        j = full_job.data[0]
        print(f"\nJob: {j['headline'][:60]}")
        print(f"  Occupation Field: {j.get('occupation_field_label', 'NULL')}")
        print(f"  Category Tags: {j.get('category_tags', [])}")

print()
print("=" * 80)
print("DIAGNOSIS")
print("=" * 80)
print("""
If bad matches have:
  - occupation_field_label = NULL → Jobs with no field are slipping through
  - occupation_field_label = something else → SQL filter not working
  - category_tags = [] or NULL → Category gate is too permissive

SOLUTION:
  1. More jobs need occupation_field_label assigned (enrich_jobs.py)
  2. Tighten the category_tags gate in SQL
""")
