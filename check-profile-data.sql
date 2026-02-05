-- Check if profile has all required data for matching
SELECT
  user_id,
  full_name,

  -- Location data (required)
  city,
  location_lat,
  location_lon,
  commute_radius_km,

  -- Vector data (required)
  CASE
    WHEN persona_current_vector IS NOT NULL THEN '✅ Has persona_current_vector'
    ELSE '❌ Missing persona_current_vector'
  END as current_vector_status,

  CASE
    WHEN persona_target_vector IS NOT NULL THEN '✅ Has persona_target_vector'
    ELSE '⚠️ No persona_target_vector (optional)'
  END as target_vector_status,

  CASE
    WHEN profile_vector IS NOT NULL THEN '✅ Has profile_vector'
    ELSE '❌ Missing profile_vector'
  END as profile_vector_status,

  -- Occupation fields (required for filtering)
  primary_occupation_field,
  occupation_field_candidates,

  -- Intent
  intent,
  entry_mode

FROM candidate_profiles
WHERE user_id = 'd0292a60-bf37-414c-baa7-f63d2dd5f836';
