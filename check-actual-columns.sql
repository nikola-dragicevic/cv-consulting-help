-- Check actual column names in job_ads table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'job_ads'
  AND table_schema = 'public'
  AND column_name LIKE ANY(ARRAY['%employer%', '%company%', '%headline%', '%title%', '%description%', 'city'])
ORDER BY column_name;

-- Also show sample data to see what's available
SELECT
  id,
  -- Show all text columns that might be company name
  CASE WHEN column_name LIKE '%employer%' OR column_name LIKE '%company%' THEN column_name END
FROM information_schema.columns
WHERE table_name = 'job_ads' AND data_type LIKE '%text%'
LIMIT 20;
