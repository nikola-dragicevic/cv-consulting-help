-- Timeout fix for dashboard base pool query.
-- Make "Matcha jobb" cheap: taxonomy + geo bounding box + minimal payload.

CREATE OR REPLACE FUNCTION fetch_dashboard_taxonomy_pool(
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  group_names TEXT[],
  category_names TEXT[],
  limit_count INT DEFAULT 2000
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  company TEXT,
  city TEXT,
  description TEXT,
  job_url TEXT,
  webpage_url TEXT,
  occupation_field_label TEXT,
  occupation_group_label TEXT,
  occupation_label TEXT,
  distance_m FLOAT,
  skills_data JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    j.id,
    j.headline AS title,
    j.company,
    COALESCE(j.city, j.location) AS city,
    ''::TEXT AS description, -- keep base pool lightweight
    j.job_url,
    j.webpage_url,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    NULL::FLOAT AS distance_m, -- distance is not needed for base pool listing speed
    j.skills_data
  FROM job_ads j
  WHERE
    j.is_active = TRUE
    AND (j.application_deadline IS NULL OR j.application_deadline >= now())
    AND COALESCE(j.location_lat, j.lat) IS NOT NULL
    AND COALESCE(j.location_lon, j.lon) IS NOT NULL
    -- Fast geo prefilter (box). Exact circle filtering happens in scoring flow if needed.
    AND ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon))
      <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
    AND (
      (
        group_names IS NOT NULL
        AND array_length(group_names, 1) > 0
        AND j.occupation_group_label = ANY(group_names)
      )
      OR
      (
        (group_names IS NULL OR array_length(group_names, 1) IS NULL)
        AND (
          category_names IS NULL
          OR array_length(category_names, 1) IS NULL
          OR j.occupation_field_label = ANY(category_names)
        )
      )
    )
  LIMIT GREATEST(limit_count, 1);
$$;

-- Helpful indexes for the new base-pool pattern
CREATE INDEX IF NOT EXISTS idx_job_ads_group_active
  ON job_ads(occupation_group_label, is_active);

CREATE INDEX IF NOT EXISTS idx_job_ads_field_active
  ON job_ads(occupation_field_label, is_active);
