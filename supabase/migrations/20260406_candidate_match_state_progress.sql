ALTER TABLE public.candidate_match_state
  ADD COLUMN IF NOT EXISTS last_pool_size integer,
  ADD COLUMN IF NOT EXISTS saved_job_count integer;
