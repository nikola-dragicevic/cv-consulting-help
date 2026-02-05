-- Test the matching function directly with your profile data
-- User: d0292a60-bf37-414c-baa7-f63d2dd5f836

-- Step 1: Get your profile data
WITH profile AS (
  SELECT
    persona_current_vector,
    location_lat,
    location_lon,
    commute_radius_km,
    occupation_field_candidates
  FROM candidate_profiles
  WHERE user_id = 'd0292a60-bf37-414c-baa7-f63d2dd5f836'
)
-- Step 2: Call the matching function with your data
SELECT
  j.id,
  j.title,
  j.company,
  j.city,
  j.occupation_field_label,
  j.occupation_group_label,
  ROUND((j.similarity * 100)::numeric, 1) as match_percent,
  ROUND((j.distance_m / 1000)::numeric, 1) as distance_km
FROM profile p,
LATERAL match_jobs_with_occupation_filter(
  p.persona_current_vector,
  p.location_lat,
  p.location_lon,
  COALESCE(p.commute_radius_km, 50) * 1000,  -- Convert km to meters
  p.occupation_field_candidates,
  20  -- Get top 20 matches
) j
ORDER BY j.similarity DESC;

-- If this returns results, the function works!
-- If this returns error, we'll see what's missing
