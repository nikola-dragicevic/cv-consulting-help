#!/usr/bin/env python3
"""Quick script to diagnose matching issues"""

import os
from supabase import create_client, Client

# Initialize Supabase
url = os.environ.get("SUPABASE_URL", "https://glmmegybqtqqahcbdjvz.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# Check the specific candidate
print("=" * 80)
print("CHECKING CANDIDATE: Lidia Dragicevic")
print("=" * 80)

candidate = supabase.table("candidate_profiles").select(
    "email, category_tags, primary_occupation_field"
).eq("email", "dragiceviclidia218@gmail.com").execute()

if candidate.data:
    c = candidate.data[0]
    print(f"Email: {c['email']}")
    print(f"Category Tags: {c['category_tags']}")
    print(f"Primary Occupation Field: {c['primary_occupation_field']}")
else:
    print("Candidate not found!")

print("\n" + "=" * 80)
print("CHECKING SAMPLE MATCHED JOBS")
print("=" * 80)

# Check some of the "bad" matches
bad_job_titles = [
    "Senior Product Quality Manager",
    "Business Analyst within eHealth",
    "Java Software Engineer",
    "Backend Developer",
    "Restaurant Manager"
]

for title in bad_job_titles:
    jobs = supabase.table("job_ads").select(
        "headline, occupation_field_label, category_tags"
    ).ilike("headline", f"%{title}%").limit(1).execute()

    if jobs.data:
        job = jobs.data[0]
        print(f"\nJob: {job['headline']}")
        print(f"  Occupation Field: {job['occupation_field_label']}")
        print(f"  Category Tags: {job['category_tags']}")

# Check some "good" matches
print("\n" + "=" * 80)
print("CHECKING GOOD MATCHES (Cleaning/Restaurant jobs)")
print("=" * 80)

good_job_titles = [
    "Home cleaner",
    "Köksbiträde"
]

for title in good_job_titles:
    jobs = supabase.table("job_ads").select(
        "headline, occupation_field_label, category_tags"
    ).ilike("headline", f"%{title}%").limit(2).execute()

    for job in jobs.data:
        print(f"\nJob: {job['headline']}")
        print(f"  Occupation Field: {job['occupation_field_label']}")
        print(f"  Category Tags: {job['category_tags']}")

# Count jobs by occupation field
print("\n" + "=" * 80)
print("JOB COUNTS BY OCCUPATION FIELD")
print("=" * 80)

# Get all distinct occupation fields with counts
result = supabase.rpc("count_jobs_by_occupation_field").execute()
if result.data:
    for row in result.data[:10]:  # Show top 10
        print(f"{row.get('occupation_field_label', 'Unknown')}: {row.get('count', 0)} jobs")
else:
    # Fallback: do it manually
    fields = supabase.table("job_ads").select("occupation_field_label").execute()
    field_counts = {}
    for job in fields.data:
        field = job.get('occupation_field_label', 'NULL')
        field_counts[field] = field_counts.get(field, 0) + 1

    for field, count in sorted(field_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"{field}: {count} jobs")
