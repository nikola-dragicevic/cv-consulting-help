ALTER TABLE public.job_ads
  ADD COLUMN IF NOT EXISTS application_url text,
  ADD COLUMN IF NOT EXISTS application_url_source text;

CREATE INDEX IF NOT EXISTS idx_job_ads_application_url
  ON public.job_ads(application_url);
