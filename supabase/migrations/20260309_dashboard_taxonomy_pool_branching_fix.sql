-- Fix intermittent statement timeouts in dashboard base-pool matching.
-- Strategy:
-- 1) match only on candidate_profiles.category_tags -> job_ads.occupation_group_label
-- 2) remove the parameter-driven OR branch from the WHERE clause
-- 3) add a geo expression index that matches ll_to_earth(COALESCE(...), COALESCE(...))

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
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF group_names IS NULL OR array_length(group_names, 1) IS NULL OR array_length(group_names, 1) = 0 THEN
    RETURN QUERY
    SELECT
      NULL::TEXT AS id,
      NULL::TEXT AS title,
      NULL::TEXT AS company,
      NULL::TEXT AS city,
      NULL::TEXT AS description,
      NULL::TEXT AS job_url,
      NULL::TEXT AS webpage_url,
      NULL::TEXT AS occupation_field_label,
      NULL::TEXT AS occupation_group_label,
      NULL::TEXT AS occupation_label,
      NULL::FLOAT AS distance_m,
      NULL::JSONB AS skills_data
    WHERE FALSE;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    j.id,
    j.headline AS title,
    j.company,
    COALESCE(j.city, j.location) AS city,
    ''::TEXT AS description,
    j.job_url,
    j.webpage_url,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    NULL::FLOAT AS distance_m,
    j.skills_data
  FROM job_ads j
  WHERE
    j.is_active = TRUE
    AND (j.application_deadline IS NULL OR j.application_deadline >= now())
    AND COALESCE(j.location_lat, j.lat) IS NOT NULL
    AND COALESCE(j.location_lon, j.lon) IS NOT NULL
    AND j.occupation_group_label = ANY(group_names)
    AND ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon))
      <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
  LIMIT GREATEST(limit_count, 1);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_job_ads_geo_earth_active
  ON job_ads
  USING gist (ll_to_earth(COALESCE(location_lat, lat), COALESCE(location_lon, lon)))
  WHERE is_active = TRUE
    AND COALESCE(location_lat, lat) IS NOT NULL
    AND COALESCE(location_lon, lon) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_ads_group_active_coords
  ON job_ads(occupation_group_label, is_active)
  WHERE COALESCE(location_lat, lat) IS NOT NULL
    AND COALESCE(location_lon, lon) IS NOT NULL;
