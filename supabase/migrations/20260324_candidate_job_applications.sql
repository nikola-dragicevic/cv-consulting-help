CREATE TABLE IF NOT EXISTS public.candidate_job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES public.job_ads(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'unknown',
  submission_source text NOT NULL DEFAULT 'self_reported',
  recipient_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_job_applications_user_id
  ON public.candidate_job_applications(user_id, created_at DESC);

ALTER TABLE public.candidate_job_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'candidate_job_applications'
      AND policyname = 'candidate_job_applications_select_own'
  ) THEN
    CREATE POLICY candidate_job_applications_select_own
      ON public.candidate_job_applications
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
      AND tablename = 'candidate_job_applications'
      AND policyname = 'candidate_job_applications_insert_own'
  ) THEN
    CREATE POLICY candidate_job_applications_insert_own
      ON public.candidate_job_applications
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
      AND tablename = 'candidate_job_applications'
      AND policyname = 'candidate_job_applications_update_own'
  ) THEN
    CREATE POLICY candidate_job_applications_update_own
      ON public.candidate_job_applications
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
