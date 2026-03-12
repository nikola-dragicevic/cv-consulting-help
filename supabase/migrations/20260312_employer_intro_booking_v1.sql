CREATE TABLE IF NOT EXISTS public.candidate_interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  candidate_profile_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_booked boolean NOT NULL DEFAULT false,
  booked_at timestamptz,
  booking_reference uuid,
  UNIQUE (candidate_profile_id, slot_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_candidate_interview_slots_candidate
  ON public.candidate_interview_slots(candidate_profile_id, slot_date, start_time);

CREATE TABLE IF NOT EXISTS public.employer_intro_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  admin_saved_job_id uuid NOT NULL REFERENCES public.admin_saved_jobs(id) ON DELETE CASCADE,
  candidate_profile_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  job_id text,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_by_user_id uuid,
  terms_version text NOT NULL DEFAULT 'candidate_intro_terms_v1'
);

CREATE INDEX IF NOT EXISTS idx_employer_intro_links_saved_job
  ON public.employer_intro_links(admin_saved_job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.employer_intro_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  employer_intro_link_id uuid NOT NULL REFERENCES public.employer_intro_links(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  terms_version text NOT NULL,
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_employer_intro_acceptances_link
  ON public.employer_intro_acceptances(employer_intro_link_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.employer_interview_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  employer_intro_link_id uuid NOT NULL REFERENCES public.employer_intro_links(id) ON DELETE CASCADE,
  candidate_profile_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  admin_saved_job_id uuid REFERENCES public.admin_saved_jobs(id) ON DELETE SET NULL,
  candidate_slot_id uuid REFERENCES public.candidate_interview_slots(id) ON DELETE SET NULL,
  acceptance_id uuid REFERENCES public.employer_intro_acceptances(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  notes text
);

CREATE INDEX IF NOT EXISTS idx_employer_interview_bookings_candidate
  ON public.employer_interview_bookings(candidate_profile_id, booking_date, start_time);

CREATE OR REPLACE FUNCTION public.set_employer_intro_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_interview_slots_updated_at ON public.candidate_interview_slots;
CREATE TRIGGER trg_candidate_interview_slots_updated_at
BEFORE UPDATE ON public.candidate_interview_slots
FOR EACH ROW
EXECUTE FUNCTION public.set_employer_intro_updated_at();

DROP TRIGGER IF EXISTS trg_employer_intro_links_updated_at ON public.employer_intro_links;
CREATE TRIGGER trg_employer_intro_links_updated_at
BEFORE UPDATE ON public.employer_intro_links
FOR EACH ROW
EXECUTE FUNCTION public.set_employer_intro_updated_at();
