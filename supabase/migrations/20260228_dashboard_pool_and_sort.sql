-- Step 1: build unsorted taxonomy pool (radius + taxonomy)
-- Step 2: sort only the saved pool per score mode

DROP FUNCTION IF EXISTS fetch_dashboard_taxonomy_pool(FLOAT, FLOAT, INT, TEXT[], TEXT[], INT);
DROP FUNCTION IF EXISTS sort_dashboard_pool_by_mode(vector(768), TEXT[], TEXT[], TEXT[], TEXT[], INT, TEXT);

CREATE OR REPLACE FUNCTION fetch_dashboard_taxonomy_pool(
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  group_names TEXT[],
  category_names TEXT[],
  limit_count INT DEFAULT 5000
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
    j.description_text AS description,
    j.job_url,
    j.webpage_url,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    earth_distance(
      ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon)),
      ll_to_earth(candidate_lat, candidate_lon)
    )::FLOAT AS distance_m,
    j.skills_data
  FROM job_ads j
  WHERE
    j.is_active = TRUE
    AND (j.application_deadline IS NULL OR j.application_deadline >= now())
    AND COALESCE(j.location_lat, j.lat) IS NOT NULL
    AND COALESCE(j.location_lon, j.lon) IS NOT NULL
    AND ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon))
      <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
    AND earth_distance(
      ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon)),
      ll_to_earth(candidate_lat, candidate_lon)
    ) <= radius_m
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

CREATE OR REPLACE FUNCTION sort_dashboard_pool_by_mode(
  candidate_vector vector(768),
  cv_keywords TEXT[],
  job_ids TEXT[],
  group_names TEXT[],
  category_names TEXT[],
  limit_count INT DEFAULT 5000,
  score_mode TEXT DEFAULT 'jobbnu'
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
  vector_similarity FLOAT,
  keyword_hit_count INT,
  keyword_total_count INT,
  keyword_hit_rate FLOAT,
  keyword_miss_rate FLOAT,
  jobbnu_score FLOAT,
  ats_score FLOAT,
  taxonomy_score FLOAT,
  display_score FLOAT,
  skills_data JSONB
)
LANGUAGE sql
STABLE
AS $$
WITH base AS (
  SELECT
    j.id,
    j.headline AS title,
    j.company,
    COALESCE(j.city, j.location) AS city,
    j.description_text AS description,
    j.job_url,
    j.webpage_url,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    j.skills_data,
    (1 - (j.embedding <=> candidate_vector))::FLOAT AS vec_sim,
    (
      SELECT COUNT(*)::INT
      FROM unnest(COALESCE(cv_keywords, ARRAY[]::TEXT[])) AS keyword
      WHERE j.description_text ILIKE '%' || keyword || '%'
         OR j.headline ILIKE '%' || keyword || '%'
    ) AS kw_hits,
    cardinality(COALESCE(cv_keywords, ARRAY[]::TEXT[]))::INT AS kw_total
  FROM job_ads j
  WHERE
    j.id = ANY(COALESCE(job_ids, ARRAY[]::TEXT[]))
    AND j.is_active = TRUE
    AND (j.application_deadline IS NULL OR j.application_deadline >= now())
    AND j.embedding IS NOT NULL
),
scored AS (
  SELECT
    b.*,
    CASE
      WHEN b.kw_total > 0 THEN LEAST(1.0, GREATEST(0.0, b.kw_hits::FLOAT / b.kw_total::FLOAT))
      ELSE 0.0
    END AS kw_hit_rate,
    CASE
      WHEN b.kw_total > 0 THEN LEAST(1.0, GREATEST(0.0, 1.0 - (b.kw_hits::FLOAT / b.kw_total::FLOAT)))
      ELSE 1.0
    END AS kw_miss_rate
  FROM base b
)
SELECT
  s.id,
  s.title,
  s.company,
  s.city,
  s.description,
  s.job_url,
  s.webpage_url,
  s.occupation_field_label,
  s.occupation_group_label,
  s.occupation_label,
  s.vec_sim AS vector_similarity,
  s.kw_hits AS keyword_hit_count,
  s.kw_total AS keyword_total_count,
  s.kw_hit_rate AS keyword_hit_rate,
  s.kw_miss_rate AS keyword_miss_rate,
  (100.0 * ((0.4 * s.vec_sim) + (0.3 * s.kw_hit_rate) + (0.3 * (1.0 - s.kw_miss_rate))))::FLOAT AS jobbnu_score,
  (100.0 * s.kw_hit_rate)::FLOAT AS ats_score,
  (
    CASE
      WHEN group_names IS NOT NULL
           AND array_length(group_names, 1) > 0
           AND s.occupation_group_label = ANY(group_names) THEN 100.0
      WHEN category_names IS NOT NULL
           AND array_length(category_names, 1) > 0
           AND s.occupation_field_label = ANY(category_names) THEN 80.0
      ELSE 40.0
    END
  )::FLOAT AS taxonomy_score,
  (
    CASE
      WHEN lower(COALESCE(score_mode, 'jobbnu')) = 'ats' THEN (100.0 * s.kw_hit_rate)
      WHEN lower(COALESCE(score_mode, 'jobbnu')) = 'taxonomy' THEN
        (
          CASE
            WHEN group_names IS NOT NULL
                 AND array_length(group_names, 1) > 0
                 AND s.occupation_group_label = ANY(group_names) THEN 100.0
            WHEN category_names IS NOT NULL
                 AND array_length(category_names, 1) > 0
                 AND s.occupation_field_label = ANY(category_names) THEN 80.0
            ELSE 40.0
          END
        )
      ELSE (100.0 * ((0.4 * s.vec_sim) + (0.3 * s.kw_hit_rate) + (0.3 * (1.0 - s.kw_miss_rate))))
    END
  )::FLOAT AS display_score,
  s.skills_data
FROM scored s
ORDER BY display_score DESC, vector_similarity DESC
LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION fetch_dashboard_taxonomy_pool(FLOAT, FLOAT, INT, TEXT[], TEXT[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_dashboard_taxonomy_pool(FLOAT, FLOAT, INT, TEXT[], TEXT[], INT) TO service_role;
GRANT EXECUTE ON FUNCTION sort_dashboard_pool_by_mode(vector(768), TEXT[], TEXT[], TEXT[], TEXT[], INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sort_dashboard_pool_by_mode(vector(768), TEXT[], TEXT[], TEXT[], TEXT[], INT, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS dashboard_match_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_job_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ai_manager_job_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ats_job_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  taxonomy_job_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  query_meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  base_updated_at TIMESTAMPTZ,
  ai_manager_updated_at TIMESTAMPTZ,
  ats_updated_at TIMESTAMPTZ,
  taxonomy_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dashboard_match_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboard match state"
  ON dashboard_match_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own dashboard match state"
  ON dashboard_match_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON dashboard_match_state TO authenticated;
