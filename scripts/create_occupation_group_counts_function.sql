-- SQL Function to aggregate occupation_group_label counts (subcategories) efficiently
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_occupation_group_counts()
RETURNS TABLE (
  occupation_group_label TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    occupation_group_label,
    COUNT(*) as count
  FROM job_ads
  WHERE occupation_group_label IS NOT NULL
  GROUP BY occupation_group_label
  ORDER BY count DESC;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION get_occupation_group_counts() TO anon, authenticated, service_role;

-- Test the function
-- SELECT * FROM get_occupation_group_counts();
