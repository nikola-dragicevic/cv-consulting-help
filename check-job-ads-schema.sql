-- Check the actual columns in job_ads table
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'job_ads'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Also show a sample row to see the data
SELECT
  id,
  headline,
  employer_name,
  workplace_address_municipality,
  occupation_field_label,
  occupation_group_label,
  embedding IS NOT NULL as has_embedding,
  removed
FROM job_ads
WHERE embedding IS NOT NULL
  AND removed = FALSE
LIMIT 3;
