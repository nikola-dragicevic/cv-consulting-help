DROP INDEX IF EXISTS public.idx_job_ads_application_url;

CREATE INDEX IF NOT EXISTS idx_job_ads_application_url
  ON public.job_ads USING hash (application_url);
