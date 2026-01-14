#!/usr/bin/env python3
import os
from supabase import create_client

supabase = create_client(
    "https://glmmegybqtqqahcbdjvz.supabase.co",
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

# Get both profiles
profiles = supabase.table("candidate_profiles").select(
    "email, category_tags, primary_occupation_field, user_id"
).in_("email", ["dragiceviclidia218@gmail.com", "info@jobbnu.se"]).execute()

for p in profiles.data:
    print("=" * 60)
    print(f"Email: {p['email']}")
    print(f"User ID: {p['user_id']}")
    print(f"Category Tags: {p['category_tags']}")
    print(f"Occupation Fields: {p['primary_occupation_field']}")
    print(f"Type: {type(p['primary_occupation_field'])}")
    print()
