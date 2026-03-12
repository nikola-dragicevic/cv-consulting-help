ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS age integer;

ALTER TABLE candidate_profiles
  DROP CONSTRAINT IF EXISTS candidate_profiles_age_check;

ALTER TABLE candidate_profiles
  ADD CONSTRAINT candidate_profiles_age_check
  CHECK (age IS NULL OR age BETWEEN 16 AND 100);
