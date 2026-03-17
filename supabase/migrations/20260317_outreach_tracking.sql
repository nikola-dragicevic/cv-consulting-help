CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  admin_saved_job_id uuid NOT NULL REFERENCES public.admin_saved_jobs(id) ON DELETE CASCADE,
  employer_intro_link_id uuid REFERENCES public.employer_intro_links(id) ON DELETE SET NULL,
  candidate_profile_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  job_id text,
  provider text NOT NULL DEFAULT 'postmark',
  provider_message_id text,
  provider_message_stream text,
  sender_email text NOT NULL,
  sender_name text,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text,
  send_status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  first_delivered_at timestamptz,
  opened_at timestamptz,
  first_clicked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_saved_job
  ON public.outreach_messages(admin_saved_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_intro_link
  ON public.outreach_messages(employer_intro_link_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_messages_provider_message_id
  ON public.outreach_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.outreach_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  outreach_message_id uuid REFERENCES public.outreach_messages(id) ON DELETE CASCADE,
  admin_saved_job_id uuid REFERENCES public.admin_saved_jobs(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'postmark',
  provider_event_id text,
  provider_message_id text,
  recipient_email text,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_outreach_message_events_message
  ON public.outreach_message_events(outreach_message_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_message_events_saved_job
  ON public.outreach_message_events(admin_saved_job_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.employer_intro_page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  employer_intro_link_id uuid NOT NULL REFERENCES public.employer_intro_links(id) ON DELETE CASCADE,
  admin_saved_job_id uuid REFERENCES public.admin_saved_jobs(id) ON DELETE CASCADE,
  candidate_profile_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  acceptance_id uuid REFERENCES public.employer_intro_acceptances(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.employer_interview_bookings(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  referrer text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_employer_intro_page_events_link
  ON public.employer_intro_page_events(employer_intro_link_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_employer_intro_page_events_saved_job
  ON public.employer_intro_page_events(admin_saved_job_id, event_type, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_outreach_messages_updated_at ON public.outreach_messages;
CREATE TRIGGER trg_outreach_messages_updated_at
BEFORE UPDATE ON public.outreach_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_employer_intro_updated_at();
