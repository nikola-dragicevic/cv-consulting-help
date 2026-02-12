-- Layer 4 preparation: Add skills_data JSONB column to job_ads
-- This will store structured required and preferred skills extracted by local LLM

ALTER TABLE job_ads
ADD COLUMN IF NOT EXISTS skills_data JSONB DEFAULT '{}'::jsonb;

-- Add index for faster JSONB queries
CREATE INDEX IF NOT EXISTS idx_job_ads_skills_data ON job_ads USING GIN (skills_data);

-- Add comment for documentation
COMMENT ON COLUMN job_ads.skills_data IS 'Structured skills extracted from job description: {required_skills: [], preferred_skills: []}';
