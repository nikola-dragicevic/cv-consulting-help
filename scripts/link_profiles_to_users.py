#!/usr/bin/env python3
"""
Script to link existing candidate_profiles to auth.users based on email.
This is useful for migrating data where user_id is null.
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def link_profiles_to_users():
    """
    Find candidate_profiles with null user_id and link them to auth.users by email.
    """
    print("🔍 Finding profiles with null user_id...")

    # Get profiles without user_id
    response = supabase.table("candidate_profiles")\
        .select("id, email, full_name")\
        .is_("user_id", "null")\
        .execute()

    profiles = response.data

    if not profiles:
        print("✅ No profiles need linking.")
        return

    print(f"📋 Found {len(profiles)} profiles to link.\n")

    linked = 0
    skipped = 0
    errors = 0

    for profile in profiles:
        email = profile.get("email")
        profile_id = profile.get("id")
        full_name = profile.get("full_name", "Unknown")

        if not email:
            print(f"⚠️  Skipping {full_name} (ID: {profile_id}) - no email")
            skipped += 1
            continue

        try:
            # Find user by email in auth.users
            # Note: This requires service_role key
            auth_response = supabase.rpc("get_user_by_email", {"email_param": email}).execute()

            if not auth_response.data or len(auth_response.data) == 0:
                print(f"⚠️  No auth user found for {email} ({full_name})")
                skipped += 1
                continue

            user_id = auth_response.data[0].get("id")

            if not user_id:
                print(f"❌ Could not extract user_id for {email}")
                errors += 1
                continue

            # Update the profile with user_id
            update_response = supabase.table("candidate_profiles")\
                .update({"user_id": user_id})\
                .eq("id", profile_id)\
                .execute()

            print(f"✅ Linked {email} ({full_name}) to user {user_id}")
            linked += 1

        except Exception as e:
            print(f"❌ Error linking {email}: {e}")
            errors += 1

    print(f"\n📊 Summary:")
    print(f"   Linked: {linked}")
    print(f"   Skipped: {skipped}")
    print(f"   Errors: {errors}")

if __name__ == "__main__":
    # First, we need to create the helper function in Supabase
    print("⚠️  IMPORTANT: You need to run this SQL in Supabase first:\n")
    print("""
-- Create a helper function to query auth.users by email
CREATE OR REPLACE FUNCTION get_user_by_email(email_param TEXT)
RETURNS TABLE (id UUID, email TEXT)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT auth.users.id, auth.users.email::TEXT
    FROM auth.users
    WHERE auth.users.email = email_param;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION get_user_by_email(TEXT) TO service_role;
    """)

    response = input("\nHave you run the SQL above? (yes/no): ")

    if response.lower() in ["yes", "y"]:
        link_profiles_to_users()
    else:
        print("\n❌ Please run the SQL in Supabase SQL Editor first, then run this script again.")
