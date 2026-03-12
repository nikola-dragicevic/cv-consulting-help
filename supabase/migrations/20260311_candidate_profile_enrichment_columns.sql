ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS experience_titles TEXT[],
  ADD COLUMN IF NOT EXISTS education_titles TEXT[],
  ADD COLUMN IF NOT EXISTS search_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS seniority_reason TEXT,
  ADD COLUMN IF NOT EXISTS experience_summary TEXT,
  ADD COLUMN IF NOT EXISTS seniority_by_track JSONB,
  ADD COLUMN IF NOT EXISTS relevant_experience_years JSONB;

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_search_keywords
  ON candidate_profiles USING gin (search_keywords);

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_experience_titles
  ON candidate_profiles USING gin (experience_titles);

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_education_titles
  ON candidate_profiles USING gin (education_titles);
