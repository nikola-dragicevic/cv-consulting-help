#!/usr/bin/env python3
import os
from supabase import create_client

supabase = create_client(
    "https://glmmegybqtqqahcbdjvz.supabase.co",
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

# Check Lidia's data
profile = supabase.table("candidate_profiles").select(
    "id, user_id, email, primary_occupation_field"
).eq("email", "dragiceviclidia218@gmail.com").execute()

if profile.data:
    p = profile.data[0]
    print(f"ID: {p.get('id')}")
    print(f"User ID: {p.get('user_id')}")
    print(f"Email: {p.get('email')}")
    print(f"Occupation Fields: {p.get('primary_occupation_field')}")
    print(f"Type: {type(p.get('primary_occupation_field'))}")
else:
    print("Not found")
