-- Recreate sort_dashboard_pool_by_mode after changing OUT columns.
-- PostgreSQL does not allow changing the return type of an existing function
-- with CREATE OR REPLACE when the OUT parameter shape differs.

DROP FUNCTION IF EXISTS sort_dashboard_pool_by_mode(vector(768), TEXT[], TEXT[], TEXT[], TEXT[], INT, TEXT);

CREATE FUNCTION sort_dashboard_pool_by_mode(
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
  keyword_match_score FLOAT,
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
  (100.0 * s.kw_hit_rate)::FLOAT AS keyword_match_score,
  (
    CASE
      WHEN lower(COALESCE(score_mode, 'jobbnu')) = 'keyword_match' THEN (100.0 * s.kw_hit_rate)
      ELSE (100.0 * ((0.4 * s.vec_sim) + (0.3 * s.kw_hit_rate) + (0.3 * (1.0 - s.kw_miss_rate))))
    END
  )::FLOAT AS display_score,
  s.skills_data
FROM scored s
ORDER BY display_score DESC, vector_similarity DESC
LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION sort_dashboard_pool_by_mode(vector(768), TEXT[], TEXT[], TEXT[], TEXT[], INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sort_dashboard_pool_by_mode(vector(768), TEXT[], TEXT[], TEXT[], TEXT[], INT, TEXT) TO service_role;
