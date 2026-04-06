CREATE TABLE IF NOT EXISTS public.candidate_interview_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES public.job_ads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_interview_preparations_user_id
  ON public.candidate_interview_preparations(user_id, created_at DESC);

ALTER TABLE public.candidate_interview_preparations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'candidate_interview_preparations'
      AND policyname = 'candidate_interview_preparations_select_own'
  ) THEN
    CREATE POLICY candidate_interview_preparations_select_own
      ON public.candidate_interview_preparations
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'candidate_interview_preparations'
      AND policyname = 'candidate_interview_preparations_insert_own'
  ) THEN
    CREATE POLICY candidate_interview_preparations_insert_own
      ON public.candidate_interview_preparations
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'candidate_interview_preparations'
      AND policyname = 'candidate_interview_preparations_update_own'
  ) THEN
    CREATE POLICY candidate_interview_preparations_update_own
      ON public.candidate_interview_preparations
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
