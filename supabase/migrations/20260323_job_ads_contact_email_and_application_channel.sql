ALTER TABLE public.job_ads
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS has_contact_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_email_source text,
  ADD COLUMN IF NOT EXISTS application_channel text,
  ADD COLUMN IF NOT EXISTS application_channel_reason text;

CREATE INDEX IF NOT EXISTS idx_job_ads_has_contact_email
  ON public.job_ads(has_contact_email);

CREATE INDEX IF NOT EXISTS idx_job_ads_application_channel
  ON public.job_ads(application_channel);
