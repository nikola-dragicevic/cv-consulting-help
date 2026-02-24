-- Fix match_jobs_granite: clean version with geo filter always active.
-- group_names (TEXT[]) hard-filters by occupation_group_label within the geo radius.
-- category_names (TEXT[]) adds a soft field-level bonus when no group filter is active.

DROP FUNCTION IF EXISTS match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT, TEXT[]);
DROP FUNCTION IF EXISTS match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT);

CREATE OR REPLACE FUNCTION match_jobs_granite(
  candidate_vector vector(768),
  candidate_lat    FLOAT,
  candidate_lon    FLOAT,
  radius_m         INT,
  category_names   TEXT[],
  cv_keywords      TEXT[],
  limit_count      INT    DEFAULT 100,
  group_names      TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id                      TEXT,
  title                   TEXT,
  company                 TEXT,
  city                    TEXT,
  description             TEXT,
  occupation_field_label  TEXT,
  occupation_group_label  TEXT,
  occupation_label        TEXT,
  vector_similarity       FLOAT,
  keyword_score           FLOAT,
  category_bonus          FLOAT,
  final_score             FLOAT,
  distance_m              FLOAT,
  skills_data             JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH scored_jobs AS (
    SELECT
      j.id,
      j.headline                                   AS title,
      j.company,
      COALESCE(j.city, j.location)                 AS city,
      j.description_text                           AS description,
      j.occupation_field_label,
      j.occupation_group_label,
      j.occupation_label,
      COALESCE(j.location_lat, j.lat)              AS job_lat,
      COALESCE(j.location_lon, j.lon)              AS job_lon,
      j.skills_data,

      (1 - (j.embedding <=> candidate_vector))     AS vec_sim,

      LEAST(
        0.3,
        (
          SELECT COUNT(*) * 0.05
          FROM unnest(COALESCE(cv_keywords, ARRAY[]::TEXT[])) AS keyword
          WHERE j.description_text ILIKE '%' || keyword || '%'
             OR j.headline         ILIKE '%' || keyword || '%'
        )
      ) AS kw_score

    FROM job_ads j
    WHERE
      j.embedding IS NOT NULL
      AND j.is_active = TRUE
      AND (j.application_deadline IS NULL OR j.application_deadline >= now())
      AND COALESCE(j.location_lat, j.lat) IS NOT NULL
      AND COALESCE(j.location_lon, j.lon) IS NOT NULL
      -- Geo radius (always active)
      AND ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon))
          <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
      AND earth_distance(
            ll_to_earth(COALESCE(j.location_lat, j.lat), COALESCE(j.location_lon, j.lon)),
            ll_to_earth(candidate_lat, candidate_lon)
          ) <= radius_m
      -- Group filter (when provided, only jobs in candidate's occupation groups)
      AND (
        group_names IS NULL
        OR array_length(group_names, 1) IS NULL
        OR j.occupation_group_label = ANY(group_names)
      )
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
    s.vec_sim                                                  AS vector_similarity,
    s.kw_score                                                 AS keyword_score,
    CASE
      WHEN group_names IS NOT NULL AND array_length(group_names, 1) > 0 THEN 0.0
      WHEN category_names IS NOT NULL
        AND array_length(category_names, 1) > 0
        AND s.occupation_field_label = ANY(category_names)    THEN 0.2
      ELSE 0.0
    END                                                        AS category_bonus,
    ((s.vec_sim * 0.7) + s.kw_score +
      CASE
        WHEN group_names IS NOT NULL AND array_length(group_names, 1) > 0 THEN 0.0
        WHEN category_names IS NOT NULL AND array_length(category_names, 1) > 0
          AND s.occupation_field_label = ANY(category_names)  THEN s.vec_sim * 0.2
        ELSE 0.0
      END
    )                                                          AS final_score,
    earth_distance(
      ll_to_earth(s.job_lat, s.job_lon),
      ll_to_earth(candidate_lat, candidate_lon)
    )                                                          AS distance_m,
    s.skills_data
  FROM scored_jobs s
  ORDER BY final_score DESC
  LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT, TEXT[]) TO service_role;

COMMENT ON FUNCTION match_jobs_granite IS
  'Granite Layer 2: geo radius always active. group_names hard-filters by occupation_group_label; category_names adds soft field-level bonus when no group filter. Scored: vec_sim*0.7 + keyword_boost (max 0.3).';
