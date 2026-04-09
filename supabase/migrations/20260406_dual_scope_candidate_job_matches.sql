ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS match_scope text NOT NULL DEFAULT 'local';

DROP INDEX IF EXISTS idx_candidate_job_matches_user_score;
DROP INDEX IF EXISTS idx_candidate_job_matches_user_distance;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candidate_job_matches_user_id_job_id_key'
  ) THEN
    ALTER TABLE public.candidate_job_matches
      DROP CONSTRAINT candidate_job_matches_user_id_job_id_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candidate_job_matches_user_id_job_id_match_scope_key'
  ) THEN
    ALTER TABLE public.candidate_job_matches
      ADD CONSTRAINT candidate_job_matches_user_id_job_id_match_scope_key
      UNIQUE (user_id, job_id, match_scope);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_user_scope_score
  ON public.candidate_job_matches(user_id, match_scope, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_user_scope_distance
  ON public.candidate_job_matches(user_id, match_scope, distance_m ASC);
