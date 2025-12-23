-- Migration: Fix Location Filtering and Matching Quality
-- Date: 2025-12-23
-- Issue: IVFFlat index bypasses location filters, causing jobs from all over Sweden to appear

-- ============================================================================
-- DROP OLD FUNCTIONS
-- ============================================================================
DROP FUNCTION IF EXISTS match_jobs_initial(vector(1024), float, float, float, int);
DROP FUNCTION IF EXISTS match_jobs_initial(vector(768), float, float, float, int);
DROP FUNCTION IF EXISTS match_jobs_profile_wish(vector(1024), vector(1024), float, float, float, text, text, boolean, int);
DROP FUNCTION IF EXISTS match_jobs_profile_wish(vector(768), vector(768), float, float, float, text, text, boolean, int);

-- ============================================================================
-- FIX 1: Re-create Initial Matching Function with Proper Location Filtering
-- ============================================================================
-- Strategy: Filter by location FIRST using a CTE, THEN sort by vector similarity
-- This ensures the WHERE clause is applied before the index-accelerated ORDER BY

CREATE OR REPLACE FUNCTION match_jobs_initial(
    v_profile vector(768),
    u_lat float,
    u_lon float,
    radius_km float,
    top_k int
)
RETURNS TABLE (
    id text,
    headline text,
    description_text text,
    location text,
    location_lat float,
    location_lon float,
    company_size text,
    work_modality text,
    job_url text,
    webpage_url text,
    s_profile float
)
LANGUAGE sql STABLE
AS $$
  -- Use a CTE to filter by location first, then apply vector search
  WITH location_filtered_jobs AS (
    SELECT
      j.id,
      j.headline,
      j.description_text,
      j.location,
      j.location_lat,
      j.location_lon,
      j.company_size,
      j.work_modality,
      j.job_url,
      j.webpage_url,
      j.embedding
    FROM job_ads j
    WHERE
      j.embedding IS NOT NULL
      AND j.is_active = true
      AND (j.application_deadline IS NULL OR j.application_deadline >= now())
      AND (
        -- If radius is 9999+, include all jobs (nationwide search)
        radius_km >= 9999
        OR (
          -- Otherwise, apply bounding box filter
          -- CRITICAL: Must filter NULL coordinates here!
          j.location_lat IS NOT NULL
          AND j.location_lon IS NOT NULL
          AND j.location_lat BETWEEN u_lat - (radius_km / 111.0) AND u_lat + (radius_km / 111.0)
          AND j.location_lon BETWEEN u_lon - (radius_km / (111.0 * cos(radians(u_lat))))
                                 AND u_lon + (radius_km / (111.0 * cos(radians(u_lat))))
        )
      )
  )
  SELECT
    id,
    headline,
    description_text,
    location,
    location_lat,
    location_lon,
    company_size,
    work_modality,
    job_url,
    webpage_url,
    (1 - (embedding <=> v_profile)) as s_profile
  FROM location_filtered_jobs
  ORDER BY (embedding <=> v_profile) ASC
  LIMIT top_k;
$$;

-- ============================================================================
-- FIX 2: Re-create Refined Matching Function with Same Fix
-- ============================================================================
CREATE OR REPLACE FUNCTION match_jobs_profile_wish(
    v_profile vector(768),
    v_wish vector(768),
    u_lat float,
    u_lon float,
    radius_km float,
    metro text,
    county text,
    remote_boost boolean,
    p_top_k int
)
RETURNS TABLE (
    id text,
    headline text,
    location text,
    location_lat float,
    location_lon float,
    company_size text,
    work_modality text,
    job_url text,
    webpage_url text,
    s_profile float,
    s_wish float,
    final_score float
)
LANGUAGE sql STABLE
AS $$
  WITH location_filtered_jobs AS (
    SELECT
      j.id,
      j.headline,
      j.location,
      j.location_lat,
      j.location_lon,
      j.company_size,
      j.work_modality,
      j.job_url,
      j.webpage_url,
      j.embedding
    FROM job_ads j
    WHERE
      j.embedding IS NOT NULL
      AND j.is_active = true
      AND (j.application_deadline IS NULL OR j.application_deadline >= now())
      AND (
        radius_km >= 9999
        OR (
          j.location_lat IS NOT NULL
          AND j.location_lon IS NOT NULL
          AND j.location_lat BETWEEN u_lat - (radius_km / 111.0) AND u_lat + (radius_km / 111.0)
          AND j.location_lon BETWEEN u_lon - (radius_km / (111.0 * cos(radians(u_lat))))
                                 AND u_lon + (radius_km / (111.0 * cos(radians(u_lat))))
        )
      )
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
    (1 - (embedding <=> v_profile)) as s_profile,
    (1 - (embedding <=> v_wish)) as s_wish,
    (
      -- Weighted scoring: 20% profile (past experience), 80% wish (future goals)
      (0.2 * (1 - (embedding <=> v_profile))) +
      (0.8 * (1 - (embedding <=> v_wish))) +
      (CASE WHEN remote_boost AND work_modality IN ('hybrid', 'remote') THEN 0.05 ELSE 0 END)
    ) as final_score
  FROM location_filtered_jobs
  ORDER BY final_score DESC
  LIMIT p_top_k;
$$;

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================
-- You can test the new function with:
--
-- SELECT * FROM match_jobs_initial(
--   ARRAY[...]::vector(768),  -- Your profile vector
--   59.3293,                    -- Stockholm latitude
--   18.0686,                    -- Stockholm longitude
--   40,                         -- 40km radius
--   10                          -- Top 10 results
-- );
