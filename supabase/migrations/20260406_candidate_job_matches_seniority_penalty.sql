ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS seniority_penalty real NOT NULL DEFAULT 0;
