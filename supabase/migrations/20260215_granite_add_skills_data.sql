-- Add skills_data to match_jobs_granite function return type
-- This enables the frontend to display skill gap analysis

CREATE OR REPLACE FUNCTION match_jobs_granite(
  candidate_vector vector(768),
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  category_names TEXT[],  -- From Layer 1 categorization
  cv_keywords TEXT[],      -- Key skills/terms from CV
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
  vector_similarity FLOAT,
  keyword_score FLOAT,
  category_bonus FLOAT,
  final_score FLOAT,
  distance_m FLOAT,
  skills_data JSONB  -- NEW: Skills requirements for gap analysis
) AS $$
BEGIN
  RETURN QUERY
  WITH scored_jobs AS (
    SELECT
      j.id,
      j.title,
      j.company,
      j.city,
      j.description,
      j.occupation_field_label,
      j.occupation_group_label,
      j.occupation_label,
      j.lat,
      j.lon,
      j.skills_data,  -- NEW: Include skills data from job_ads table

      -- Base Score: Vector similarity (0-1, higher is better)
      (1 - (j.embedding <=> candidate_vector)) AS vec_sim,

      -- Keyword Bonus: Count how many keywords appear in the job description
      -- Each keyword match adds 0.05 to the score (max 0.3 for 6+ matches)
      LEAST(
        0.3,
        (
          SELECT COUNT(*) * 0.05
          FROM unnest(cv_keywords) AS keyword
          WHERE j.description ILIKE '%' || keyword || '%'
            OR j.title ILIKE '%' || keyword || '%'
        )
      ) AS kw_score,

      -- Category Bonus: 20% multiplier if category matches
      CASE
        WHEN category_names IS NOT NULL
          AND array_length(category_names, 1) > 0
          AND j.occupation_field_label = ANY(category_names)
        THEN 0.2
        ELSE 0.0
      END AS cat_bonus

    FROM job_ads j
    WHERE
      -- Location gate
      ll_to_earth(j.lat, j.lon) <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
      AND earth_distance(ll_to_earth(j.lat, j.lon), ll_to_earth(candidate_lat, candidate_lon)) <= radius_m
      -- Only active jobs with embeddings
      AND j.removed IS FALSE
      AND j.embedding IS NOT NULL
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
    -- Final Score: Weighted combination
    -- Formula: (vector_similarity * 0.7) + keyword_score + (vector_similarity * category_bonus)
    ((s.vec_sim * 0.7) + s.kw_score + (s.vec_sim * s.cat_bonus)) AS final_score,
    earth_distance(
      ll_to_earth(s.lat, s.lon),
      ll_to_earth(candidate_lat, candidate_lon)
    ) AS distance_m,
    s.skills_data  -- NEW: Return skills data for frontend
  FROM scored_jobs s
  ORDER BY
    -- Sort by final weighted score (descending)
    ((s.vec_sim * 0.7) + s.kw_score + (s.vec_sim * s.cat_bonus)) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_jobs_granite TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_granite TO service_role;

-- Add comment
COMMENT ON FUNCTION match_jobs_granite IS 'Granite Architecture Layer 2: Weighted hybrid search with vector similarity, keyword matching, category boosting, and skills data for gap analysis';
