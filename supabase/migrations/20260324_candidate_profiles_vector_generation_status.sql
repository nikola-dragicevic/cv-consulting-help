ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS vector_generation_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS vector_generation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS vector_generation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vector_generation_last_error text,
  ADD COLUMN IF NOT EXISTS vector_generation_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_vector_generation_status
  ON public.candidate_profiles(vector_generation_status);
