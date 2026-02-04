-- Migration: Add persona-based fields to candidate_profiles
-- Date: 2026-02-04
-- Purpose: Support career intent graph with past/current/target personas

-- Add intent field (Step 0 - Choose intent)
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS intent TEXT CHECK (intent IN (
  'match_current_role',
  'transition_to_target',
  'pick_categories',
  'show_multiple_tracks'
));

-- Add past persona fields (up to 3 previous roles)
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS persona_past_1_text TEXT,
ADD COLUMN IF NOT EXISTS persona_past_1_vector vector(768),
ADD COLUMN IF NOT EXISTS persona_past_2_text TEXT,
ADD COLUMN IF NOT EXISTS persona_past_2_vector vector(768),
ADD COLUMN IF NOT EXISTS persona_past_3_text TEXT,
ADD COLUMN IF NOT EXISTS persona_past_3_vector vector(768);

-- Add current persona fields
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS persona_current_text TEXT,
ADD COLUMN IF NOT EXISTS persona_current_vector vector(768);

-- Add target persona fields
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS persona_target_text TEXT,
ADD COLUMN IF NOT EXISTS persona_target_vector vector(768);

-- Add skills and education fields
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS skills_text TEXT,
ADD COLUMN IF NOT EXISTS education_certifications_text TEXT;

-- Add occupation field candidates (multi-field support)
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS occupation_field_candidates TEXT[],
ADD COLUMN IF NOT EXISTS occupation_group_candidates TEXT[],
ADD COLUMN IF NOT EXISTS occupation_targets TEXT[];

-- Add seniority level
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS seniority_level TEXT CHECK (seniority_level IN ('junior', 'mid', 'senior'));

-- Add must-have constraints
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS must_have_constraints JSONB DEFAULT '{}'::jsonb;

-- Add flag to track if user chose CV upload or manual entry
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS entry_mode TEXT CHECK (entry_mode IN ('cv_upload', 'manual_entry')) DEFAULT 'cv_upload';

-- Create indexes for vector searches
CREATE INDEX IF NOT EXISTS idx_persona_current_vector ON candidate_profiles USING ivfflat (persona_current_vector vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_persona_target_vector ON candidate_profiles USING ivfflat (persona_target_vector vector_cosine_ops) WITH (lists = 100);

-- Add comment explaining the new structure
COMMENT ON COLUMN candidate_profiles.intent IS 'User intent: match_current_role, transition_to_target, pick_categories, or show_multiple_tracks';
COMMENT ON COLUMN candidate_profiles.persona_current_text IS 'Text description of current role/position for matching';
COMMENT ON COLUMN candidate_profiles.persona_target_text IS 'Text description of target role/position user wants to transition to';
COMMENT ON COLUMN candidate_profiles.entry_mode IS 'Whether user uploaded CV or filled in fields manually';
