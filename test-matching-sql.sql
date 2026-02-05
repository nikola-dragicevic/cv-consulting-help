-- Test if function exists and works
-- Run this in Supabase SQL Editor

-- 1. Check if function exists
SELECT
  proname as function_name,
  pronargs as num_args
FROM pg_proc
WHERE proname = 'match_jobs_with_occupation_filter';

-- 2. Test the function with your profile data
SELECT * FROM match_jobs_with_occupation_filter(
  -- Replace with your actual persona_target_vector (first 10 values shown here)
  ARRAY[-0.80560714,0.18411371,-0.383494,-0.08225653,-0.6240245,0.063064605,0.123685405,-0.45195475]::vector(768),
  59.3293,  -- Stockholm lat
  18.0686,  -- Stockholm lon
  50000,    -- 50km radius
  ARRAY['Transport', 'Installation, drift, underhåll', 'Industriell tillverkning'],
  10        -- limit 10 results
);

-- 3. Check how many jobs exist in those occupation fields
SELECT
  occupation_field_label,
  COUNT(*) as job_count
FROM job_ads
WHERE occupation_field_label = ANY(ARRAY['Transport', 'Installation, drift, underhåll', 'Industriell tillverkning'])
  AND removed = false
  AND embedding IS NOT NULL
GROUP BY occupation_field_label;

-- 4. Check total jobs with embeddings
SELECT COUNT(*) as total_jobs_with_embeddings
FROM job_ads
WHERE embedding IS NOT NULL AND removed = false;
