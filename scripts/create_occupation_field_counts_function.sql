-- SQL Function to aggregate occupation_field_label counts efficiently
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_occupation_field_counts()
RETURNS TABLE (
  occupation_field_label TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    occupation_field_label,
    COUNT(*) as count
  FROM job_ads
  WHERE occupation_field_label IS NOT NULL
  GROUP BY occupation_field_label
  ORDER BY count DESC;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION get_occupation_field_counts() TO anon, authenticated, service_role;

-- Test the function
-- SELECT * FROM get_occupation_field_counts();
