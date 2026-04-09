-- Radius-first semantic retrieval for precomputed candidate matching.
-- Strategy:
-- 1) Filter active jobs by candidate radius first when location is available.
-- 2) Sort the remaining jobs by vector similarity.
-- 3) Let the worker apply keyword logic, seniority penalty and taxonomy bonus.

DROP FUNCTION IF EXISTS public.fetch_candidate_semantic_pool(vector(768), integer);
DROP FUNCTION IF EXISTS public.fetch_recent_candidate_semantic_pool(vector(768), timestamptz, integer);

CREATE OR REPLACE FUNCTION public.fetch_candidate_semantic_pool(
  candidate_vector vector(768),
  candidate_lat double precision DEFAULT NULL,
  candidate_lon double precision DEFAULT NULL,
  radius_km numeric DEFAULT NULL,
  limit_count integer DEFAULT 500
)
RETURNS TABLE (
  id text,
  title text,
  company text,
  city text,
  description text,
  job_url text,
  webpage_url text,
  occupation_field_label text,
  occupation_group_label text,
  occupation_label text,
  vector_similarity real,
  skills_data jsonb,
  contact_email text,
  has_contact_email boolean,
  application_url text,
  application_channel text,
  location_lat double precision,
  location_lon double precision,
  lat double precision,
  lon double precision,
  published_date timestamptz,
  last_seen_at timestamptz
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
    (1 - (j.embedding <=> candidate_vector))::real AS vector_similarity,
    j.skills_data,
    j.contact_email,
    j.has_contact_email,
    j.application_url,
    j.application_channel,
    j.location_lat,
    j.location_lon,
    j.lat,
    j.lon,
    j.published_date,
    j.last_seen_at
  FROM public.job_ads j
  WHERE
    j.is_active = true
    AND (j.application_deadline IS NULL OR j.application_deadline >= now())
    AND j.embedding IS NOT NULL
    AND (
      candidate_lat IS NULL
      OR candidate_lon IS NULL
      OR radius_km IS NULL
      OR (
        j.location_lat IS NOT NULL
        AND j.location_lon IS NOT NULL
        AND j.location_lat BETWEEN candidate_lat - (radius_km / 111.0) AND candidate_lat + (radius_km / 111.0)
        AND j.location_lon BETWEEN
          candidate_lon - (radius_km / (111.0 * GREATEST(ABS(COS(RADIANS(candidate_lat))), 0.1)))
          AND candidate_lon + (radius_km / (111.0 * GREATEST(ABS(COS(RADIANS(candidate_lat))), 0.1)))
        AND (
          6371.0 * ACOS(
            LEAST(
              1.0,
              GREATEST(
                -1.0,
                COS(RADIANS(candidate_lat))
                * COS(RADIANS(j.location_lat))
                * COS(RADIANS(j.location_lon) - RADIANS(candidate_lon))
                + SIN(RADIANS(candidate_lat))
                * SIN(RADIANS(j.location_lat))
              )
            )
          )
        ) <= radius_km
      )
    )
  ORDER BY j.embedding <=> candidate_vector ASC
  LIMIT GREATEST(limit_count, 1);
$$;

CREATE OR REPLACE FUNCTION public.fetch_recent_candidate_semantic_pool(
  candidate_vector vector(768),
  seen_after timestamptz,
  candidate_lat double precision DEFAULT NULL,
  candidate_lon double precision DEFAULT NULL,
  radius_km numeric DEFAULT NULL,
  limit_count integer DEFAULT 500
)
RETURNS TABLE (
  id text,
  title text,
  company text,
  city text,
  description text,
  job_url text,
  webpage_url text,
  occupation_field_label text,
  occupation_group_label text,
  occupation_label text,
  vector_similarity real,
  skills_data jsonb,
  contact_email text,
  has_contact_email boolean,
  application_url text,
  application_channel text,
  location_lat double precision,
  location_lon double precision,
  lat double precision,
  lon double precision,
  published_date timestamptz,
  last_seen_at timestamptz
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
    (1 - (j.embedding <=> candidate_vector))::real AS vector_similarity,
    j.skills_data,
    j.contact_email,
    j.has_contact_email,
    j.application_url,
    j.application_channel,
    j.location_lat,
    j.location_lon,
    j.lat,
    j.lon,
    j.published_date,
    j.last_seen_at
  FROM public.job_ads j
  WHERE
    seen_after IS NOT NULL
    AND j.is_active = true
    AND (j.application_deadline IS NULL OR j.application_deadline >= now())
    AND j.embedding IS NOT NULL
    AND j.last_seen_at IS NOT NULL
    AND j.last_seen_at > seen_after
    AND (
      candidate_lat IS NULL
      OR candidate_lon IS NULL
      OR radius_km IS NULL
      OR (
        j.location_lat IS NOT NULL
        AND j.location_lon IS NOT NULL
        AND j.location_lat BETWEEN candidate_lat - (radius_km / 111.0) AND candidate_lat + (radius_km / 111.0)
        AND j.location_lon BETWEEN
          candidate_lon - (radius_km / (111.0 * GREATEST(ABS(COS(RADIANS(candidate_lat))), 0.1)))
          AND candidate_lon + (radius_km / (111.0 * GREATEST(ABS(COS(RADIANS(candidate_lat))), 0.1)))
        AND (
          6371.0 * ACOS(
            LEAST(
              1.0,
              GREATEST(
                -1.0,
                COS(RADIANS(candidate_lat))
                * COS(RADIANS(j.location_lat))
                * COS(RADIANS(j.location_lon) - RADIANS(candidate_lon))
                + SIN(RADIANS(candidate_lat))
                * SIN(RADIANS(j.location_lat))
              )
            )
          )
        ) <= radius_km
      )
    )
  ORDER BY j.embedding <=> candidate_vector ASC
  LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.fetch_candidate_semantic_pool(vector(768), double precision, double precision, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_candidate_semantic_pool(vector(768), double precision, double precision, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_recent_candidate_semantic_pool(vector(768), timestamptz, double precision, double precision, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_recent_candidate_semantic_pool(vector(768), timestamptz, double precision, double precision, numeric, integer) TO service_role;
