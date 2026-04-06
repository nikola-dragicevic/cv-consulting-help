ALTER TABLE public.job_ads
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_inactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_ads_last_seen_at
  ON public.job_ads(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_job_ads_source_inactivated_at
  ON public.job_ads(source_inactivated_at);
