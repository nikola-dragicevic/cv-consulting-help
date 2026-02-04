-- Create SQL function for intent-based matching with occupation field filtering
-- Date: 2026-02-04

CREATE OR REPLACE FUNCTION match_jobs_with_occupation_filter(
  candidate_vector vector(768),
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  occupation_fields TEXT[],
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  company TEXT,
  city TEXT,
  description TEXT,
  occupation_field_label TEXT,
  occupation_group_label TEXT,
  occupation_label TEXT,
  similarity FLOAT,
  distance_m FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.title,
    j.company,
    j.city,
    j.description,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    1 - (j.embedding <=> candidate_vector) AS similarity,
    earth_distance(
      ll_to_earth(j.lat, j.lon),
      ll_to_earth(candidate_lat, candidate_lon)
    ) AS distance_m
  FROM job_ads j
  WHERE
    -- Step 1: Location gate
    ll_to_earth(j.lat, j.lon) <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
    AND earth_distance(ll_to_earth(j.lat, j.lon), ll_to_earth(candidate_lat, candidate_lon)) <= radius_m
    -- Step 2: Occupation field gate (only if occupation_fields is provided and not empty)
    AND (
      occupation_fields IS NULL
      OR array_length(occupation_fields, 1) IS NULL
      OR j.occupation_field_label = ANY(occupation_fields)
    )
    -- Only active jobs
    AND j.removed IS FALSE
    -- Only jobs with embeddings
    AND j.embedding IS NOT NULL
  ORDER BY
    j.embedding <=> candidate_vector ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_jobs_with_occupation_filter TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_with_occupation_filter TO service_role;

-- Add comment
COMMENT ON FUNCTION match_jobs_with_occupation_filter IS 'Intent-based job matching with occupation field filtering and location gating';
