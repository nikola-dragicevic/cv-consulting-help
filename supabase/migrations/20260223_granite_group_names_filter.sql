-- Add group_names parameter to match_jobs_granite for occupation_group_label hard-filtering.
--
-- Architecture change:
--   category_tags  (TEXT[]) = occupation_group_label values → hard-filter in WHERE clause
--   category_names (TEXT[]) = occupation_field_label values → soft cat_bonus (kept for backward compat)
--
-- When group_names is provided:
--   • WHERE j.occupation_group_label = ANY(group_names)  → only jobs in the candidate's exact groups
--   • cat_bonus = 0.0  (every returned job already matched; bonus would be noise)
-- When only category_names is provided (older profiles):
--   • No hard filter; occupation_field_label match adds +0.2 * vec_sim bonus
-- When neither is provided:
--   • Pure vector + keyword search over all jobs in the geo radius

-- Drop old 7-arg signature before replacing
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
  id                    TEXT,
  title                 TEXT,
  company               TEXT,
  city                  TEXT,
  description           TEXT,
  occupation_field_label  TEXT,
  occupation_group_label  TEXT,
  occupation_label        TEXT,
  vector_similarity     FLOAT,
  keyword_score         FLOAT,
  category_bonus        FLOAT,
  final_score           FLOAT,
  distance_m            FLOAT,
  skills_data           JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH scored_jobs AS (
    SELECT
      j.id,
      j.headline                                      AS title,
      j.company,
      COALESCE(j.city, j.location)                    AS city,
      j.description_text                              AS description,
      j.occupation_field_label,
      j.occupation_group_label,
      j.occupation_label,
      COALESCE(j.location_lat, j.lat)                 AS job_lat,
      COALESCE(j.location_lon, j.lon)                 AS job_lon,
      j.skills_data,

      (1 - (j.embedding <=> candidate_vector))        AS vec_sim,

      LEAST(
        0.3,
        (
          SELECT COUNT(*) * 0.05
          FROM unnest(COALESCE(cv_keywords, ARRAY[]::TEXT[])) AS keyword
          WHERE j.description_text ILIKE '%' || keyword || '%'
             OR j.headline         ILIKE '%' || keyword || '%'
        )
      ) AS kw_score,

      -- cat_bonus: only applies when no group-level hard filter is active.
      -- Once group_names is set every returned job already matched at the group level,
      -- so a field-level boost would artificially inflate scores.
      CASE
        WHEN group_names IS NOT NULL AND array_length(group_names, 1) > 0
        THEN 0.0
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
      -- Group-level hard filter: pass NULL to skip (backward-compatible)
      AND (
        group_names IS NULL
        OR array_length(group_names, 1) IS NULL
        OR j.occupation_group_label = ANY(group_names)
      )
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
    s.vec_sim                                               AS vector_similarity,
    s.kw_score                                              AS keyword_score,
    s.cat_bonus                                             AS category_bonus,
    ((s.vec_sim * 0.7) + s.kw_score + (s.vec_sim * s.cat_bonus)) AS final_score,
    earth_distance(
      ll_to_earth(s.job_lat, s.job_lon),
      ll_to_earth(candidate_lat, candidate_lon)
    )                                                       AS distance_m,
    s.skills_data
  FROM scored_jobs s
  ORDER BY ((s.vec_sim * 0.7) + s.kw_score + (s.vec_sim * s.cat_bonus)) DESC
  LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_granite(vector(768), FLOAT, FLOAT, INT, TEXT[], TEXT[], INT, TEXT[]) TO service_role;

COMMENT ON FUNCTION match_jobs_granite IS
  'Granite Layer 2: weighted vector+keyword matching. group_names (TEXT[]) hard-filters by occupation_group_label; category_names (TEXT[]) adds a soft field-level bonus when no group filter is active.';
