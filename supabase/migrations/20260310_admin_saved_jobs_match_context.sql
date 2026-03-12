ALTER TABLE admin_saved_jobs
  ADD COLUMN IF NOT EXISTS search_mode text,
  ADD COLUMN IF NOT EXISTS search_keyword text,
  ADD COLUMN IF NOT EXISTS search_address text,
  ADD COLUMN IF NOT EXISTS search_radius_km numeric,
  ADD COLUMN IF NOT EXISTS candidate_cv_text text;

CREATE INDEX IF NOT EXISTS idx_admin_saved_jobs_search_mode
  ON admin_saved_jobs(search_mode);
