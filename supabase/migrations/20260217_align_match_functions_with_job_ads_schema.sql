-- Align matching RPC functions with the current job_ads schema.
-- Current schema uses:
--   company, headline, description_text, is_active, location_lat/location_lon (plus lat/lon fallback)

-- ============================================================================
-- 1) Fix Granite function used by intent-based matching
-- ============================================================================
DROP FUNCTION IF EXISTS match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT);

CREATE FUNCTION match_jobs_granite(
  candidate_vector vector(768),
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  category_names TEXT[],
  cv_keywords TEXT[],
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  company TEXT,
  city TEXT,
  description TEXT,
  occupation_field_label TEXT,
  occupation_group_label TEXT,
  occupation_label TEXT,
  vector_similarity FLOAT,
  keyword_score FLOAT,
  category_bonus FLOAT,
  final_score FLOAT,
  distance_m FLOAT,
  skills_data JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH scored_jobs AS (
    SELECT
      j.id,
      j.headline AS title,
      j.company,
      COALESCE(j.city, j.location) AS city,
      j.description_text AS description,
      j.occupation_field_label,
      j.occupation_group_label,
      j.occupation_label,
      COALESCE(j.location_lat, j.lat) AS job_lat,
      COALESCE(j.location_lon, j.lon) AS job_lon,
      j.skills_data,

      (1 - (j.embedding <=> candidate_vector)) AS vec_sim,

      LEAST(
        0.3,
        (
          SELECT COUNT(*) * 0.05
          FROM unnest(COALESCE(cv_keywords, ARRAY[]::TEXT[])) AS keyword
          WHERE j.description_text ILIKE '%' || keyword || '%'
             OR j.headline ILIKE '%' || keyword || '%'
        )
      ) AS kw_score,

      CASE
        WHEN category_names IS NOT NULL
          AND array_length(category_names, 1) > 0
          AND j.occupation_field_label = ANY(category_names)
        THEN 0.2
        ELSE 0.0
      END AS cat_bonus
    FROM job_ads j
    WHERE
      j.embedding IS NOT NULL
      AND j.is_active = TRUE
      AND (j.application_deadline IS NULL OR j.application_deadline >= now())
      AND COALESCE(j.location_lat, j.lat) IS NOT NULL
      AND COALESCE(j.location_lon, j.lon) IS NOT NULL
      AND ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon))
          <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
      AND earth_distance(
            ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon)),
            ll_to_earth(candidate_lat, candidate_lon)
          ) <= radius_m
  )
  SELECT
    s.id,
    s.title,
    s.company,
    s.city,
    s.description,
    s.occupation_field_label,
    s.occupation_group_label,
    s.occupation_label,
    s.vec_sim AS vector_similarity,
    s.kw_score AS keyword_score,
    s.cat_bonus AS category_bonus,
    ((s.vec_sim * 0.7) + s.kw_score + (s.vec_sim * s.cat_bonus)) AS final_score,
    earth_distance(
      ll_to_earth(s.job_lat, s.job_lon),
      ll_to_earth(candidate_lat, candidate_lon)
    ) AS distance_m,
    s.skills_data
  FROM scored_jobs s
  ORDER BY
    ((s.vec_sim * 0.7) + s.kw_score + (s.vec_sim * s.cat_bonus)) DESC
  LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT) TO service_role;

COMMENT ON FUNCTION match_jobs_granite IS
  'Granite Layer 2 matching aligned with job_ads schema (headline/company/description_text/is_active)';

-- ============================================================================
-- 2) Fix logged-in "Hitta matchningar" function
-- ============================================================================
DROP FUNCTION IF EXISTS match_jobs_with_occupation_filter(vector(768), FLOAT, FLOAT, INT, TEXT[], INT);

CREATE FUNCTION match_jobs_with_occupation_filter(
  candidate_vector vector(768),
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  occupation_fields TEXT[],
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  id TEXT,
  headline TEXT,
  location TEXT,
  location_lat FLOAT,
  location_lon FLOAT,
  company_size TEXT,
  work_modality TEXT,
  job_url TEXT,
  webpage_url TEXT,
  s_profile FLOAT
)
LANGUAGE sql
STABLE
AS $$
  WITH location_filtered_jobs AS (
    SELECT
      j.id,
      j.headline,
      j.location,
      COALESCE(j.location_lat, j.lat) AS location_lat,
      COALESCE(j.location_lon, j.lon) AS location_lon,
      j.company_size,
      j.work_modality,
      j.job_url,
      j.webpage_url,
      j.embedding
    FROM job_ads j
    WHERE
      j.embedding IS NOT NULL
      AND j.is_active = TRUE
      AND (j.application_deadline IS NULL OR j.application_deadline >= now())
      AND COALESCE(j.location_lat, j.lat) IS NOT NULL
      AND COALESCE(j.location_lon, j.lon) IS NOT NULL
      AND (
        occupation_fields IS NULL
        OR array_length(occupation_fields, 1) IS NULL
        OR (
          j.occupation_field_label IS NOT NULL
          AND j.occupation_field_label = ANY(occupation_fields)
        )
      )
      AND ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon))
          <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
      AND earth_distance(
            ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon)),
            ll_to_earth(candidate_lat, candidate_lon)
          ) <= radius_m
  )
  SELECT
    id,
    headline,
    location,
    location_lat,
    location_lon,
    company_size,
    work_modality,
    job_url,
    webpage_url,
    (1 - (embedding <=> candidate_vector)) AS s_profile
  FROM location_filtered_jobs
  ORDER BY (embedding <=> candidate_vector) ASC
  LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION match_jobs_with_occupation_filter(vector(768), FLOAT, FLOAT, INT, TEXT[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_with_occupation_filter(vector(768), FLOAT, FLOAT, INT, TEXT[], INT) TO service_role;

COMMENT ON FUNCTION match_jobs_with_occupation_filter IS
  'Logged-in matching aligned with job_ads schema (headline/description_text/is_active)';
