#!/usr/bin/env python3
"""Test the EXACT response the API returns for Lidia"""

import os
from supabase import create_client

supabase = create_client(
    "https://glmmegybqtqqahcbdjvz.supabase.co",
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

print("=" * 80)
print("TESTING EXACT API RESPONSE FOR LIDIA")
print("=" * 80)
print()

# Get Lidia's profile (exactly as the API does)
profile = supabase.table("candidate_profiles").select(
    "profile_vector, category_tags, primary_occupation_field, location_lat, location_lon, commute_radius_km"
).eq("email", "dragiceviclidia218@gmail.com").single().execute()

if not profile.data:
    print("❌ Profile not found!")
    exit(1)

p = profile.data

print(f"✅ Found profile")
print(f"   Category Tags: {p['category_tags']}")
print(f"   Occupation Fields: {p['primary_occupation_field']}")
print(f"   Type: {type(p['primary_occupation_field'])}")
print()

# Call match_jobs_initial EXACTLY as the API does
print("Calling match_jobs_initial with:")
print(f"  filter_occupation_fields: {p['primary_occupation_field']}")
print()

result = supabase.rpc("match_jobs_initial", {
    "v_profile": p['profile_vector'],
    "u_lat": p['location_lat'],
    "u_lon": p['location_lon'],
    "radius_km": p['commute_radius_km'],
    "top_k": 20,  # Same as API
    "candidate_tags": p['category_tags'],
    "filter_occupation_fields": p['primary_occupation_field']
}).execute()

jobs = result.data

print(f"✅ Got {len(jobs)} jobs from API")
print()
print("=" * 80)
print("TOP 20 JOBS (EXACTLY WHAT API RETURNS)")
print("=" * 80)
print()

# Categorize each job
for i, job in enumerate(jobs, 1):
    title = job['headline']
    score = round(job['s_profile'] * 100)

    # Categorize
    category = "❓"
    if any(word in title.lower() for word in ['clean', 'städ', 'lokalvård']):
        category = "🧹 CLEAN"
    elif any(word in title.lower() for word in ['restaurang', 'kök', 'servic', 'bronck', 'bar', 'cook', 'chef']):
        category = "🍽️ REST"
    elif any(word in title.lower() for word in ['manager', 'chef', 'lead', 'director', 'head']):
        category = "👔 MGR"
    elif any(word in title.lower() for word in ['engineer', 'developer', 'analyst', 'data', 'software', 'java', 'backend', 'it']):
        category = "💻 TECH"

    print(f"{i:2}. {category} {title[:60]:<60} ({score}%)")

# Count categories
clean = sum(1 for j in jobs if any(w in j['headline'].lower() for w in ['clean', 'städ', 'lokalvård']))
rest = sum(1 for j in jobs if any(w in j['headline'].lower() for w in ['restaurang', 'kök', 'servic', 'bronck', 'bar', 'cook', 'chef']))
mgr = sum(1 for j in jobs if any(w in j['headline'].lower() for w in ['manager', 'chef', 'lead', 'director', 'head']))
tech = sum(1 for j in jobs if any(w in j['headline'].lower() for w in ['engineer', 'developer', 'analyst', 'data', 'software', 'java', 'backend', 'it']))

print()
print("=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"🧹 Cleaning jobs: {clean}")
print(f"🍽️ Restaurant jobs: {rest}")
print(f"👔 Manager jobs: {mgr}")
print(f"💻 Tech jobs: {tech}")
print()

if tech > 0:
    print("❌ PROBLEM: Tech jobs are appearing!")
    print("   The SQL filter is NOT working correctly.")
    print()
    print("Tech jobs that appeared:")
    for job in jobs:
        if any(w in job['headline'].lower() for w in ['engineer', 'developer', 'analyst', 'data', 'software', 'java', 'backend', 'it']):
            print(f"  - {job['headline']}")
else:
    print("✅ SUCCESS: No tech jobs appearing!")
    print("   The SQL filter IS working correctly.")
    print()
    print("If you see tech jobs on frontend but NOT here,")
    print("then the frontend is showing OLD cached data or")
    print("combining multiple API responses.")
