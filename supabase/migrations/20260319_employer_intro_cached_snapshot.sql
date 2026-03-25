ALTER TABLE employer_intro_links
  ADD COLUMN IF NOT EXISTS cached_intro_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS cached_intro_generated_at timestamptz;
