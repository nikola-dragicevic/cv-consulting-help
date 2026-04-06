-- Precomputed candidate matching
-- Strategy:
-- 1) Retrieve a broad semantic pool across all active Sweden jobs.
-- 2) Re-score in the worker with keyword hits/misses and taxonomy bonus.
-- 3) Save the top 500 jobs per user in a durable table.
-- 4) Let the dashboard read precomputed rows and keep the old live flow as fallback.

CREATE TABLE IF NOT EXISTS public.candidate_match_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_signature text NOT NULL DEFAULT '',
  match_ready boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_full_refresh_at timestamptz,
  last_incremental_refresh_at timestamptz,
  last_job_ingest_seen_at timestamptz,
  active_radius_km numeric,
  candidate_lat double precision,
  candidate_lon double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidate_job_matches (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES public.job_ads(id) ON DELETE CASCADE,
  match_source text NOT NULL DEFAULT 'full_refresh',
  vector_similarity real NOT NULL DEFAULT 0,
  keyword_hits text[] NOT NULL DEFAULT ARRAY[]::text[],
  keyword_hit_count integer NOT NULL DEFAULT 0,
  keyword_total_count integer NOT NULL DEFAULT 0,
  keyword_hit_rate real NOT NULL DEFAULT 0,
  keyword_miss_rate real NOT NULL DEFAULT 1,
  taxonomy_hit_count integer NOT NULL DEFAULT 0,
  taxonomy_bonus real NOT NULL DEFAULT 0,
  base_score real NOT NULL DEFAULT 0,
  final_score real NOT NULL DEFAULT 0,
  distance_m real,
  job_published_at timestamptz,
  job_last_seen_at timestamptz,
  matched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_user_score
  ON public.candidate_job_matches(user_id, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_user_distance
  ON public.candidate_job_matches(user_id, distance_m ASC);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_job_id
  ON public.candidate_job_matches(job_id);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_matched_at
  ON public.candidate_job_matches(matched_at DESC);

ALTER TABLE public.candidate_match_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own candidate match state"
  ON public.candidate_match_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own candidate job matches"
  ON public.candidate_job_matches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.candidate_match_state TO authenticated;
GRANT SELECT ON public.candidate_job_matches TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.candidate_job_matches_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_candidate_semantic_pool(
  candidate_vector vector(768),
  limit_count integer DEFAULT 1000
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
  ORDER BY j.embedding <=> candidate_vector ASC
  LIMIT GREATEST(limit_count, 1);
$$;

CREATE OR REPLACE FUNCTION public.fetch_recent_candidate_semantic_pool(
  candidate_vector vector(768),
  seen_after timestamptz,
  limit_count integer DEFAULT 300
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
  ORDER BY j.embedding <=> candidate_vector ASC
  LIMIT GREATEST(limit_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.fetch_candidate_semantic_pool(vector(768), integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_candidate_semantic_pool(vector(768), integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_recent_candidate_semantic_pool(vector(768), timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_recent_candidate_semantic_pool(vector(768), timestamptz, integer) TO service_role;

COMMENT ON TABLE public.candidate_match_state IS
  'Tracks whether a candidate needs a full rematch or incremental refresh for precomputed dashboard results.';

COMMENT ON TABLE public.candidate_job_matches IS
  'Durable per-user saved match rows populated offline from semantic retrieval plus worker-side scoring.';
