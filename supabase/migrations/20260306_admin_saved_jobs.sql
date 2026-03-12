-- Admin saved jobs: jobs saved by admin for candidate outreach
CREATE TABLE IF NOT EXISTS admin_saved_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  candidate_label text NOT NULL DEFAULT '',
  candidate_profile_id uuid REFERENCES candidate_profiles(id) ON DELETE SET NULL,
  job_id text NOT NULL,
  headline text,
  company text,
  city text,
  distance_km numeric,
  webpage_url text,
  occupation_group_label text,
  notes text,
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_saved_jobs_created_at ON admin_saved_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_saved_jobs_candidate ON admin_saved_jobs(candidate_label);
CREATE INDEX IF NOT EXISTS idx_admin_saved_jobs_job_id ON admin_saved_jobs(job_id);
