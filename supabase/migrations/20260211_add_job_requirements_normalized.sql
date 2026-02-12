-- Migration: Add normalized requirement store for deterministic gap-based matching
-- Date: 2026-02-11

CREATE TABLE IF NOT EXISTS job_requirements_normalized (
  job_id TEXT PRIMARY KEY REFERENCES job_ads(id) ON DELETE CASCADE,
  requirements_version INT NOT NULL DEFAULT 1,

  must_have_skills TEXT[] NOT NULL DEFAULT '{}',
  must_have_licenses TEXT[] NOT NULL DEFAULT '{}',
  must_have_certifications TEXT[] NOT NULL DEFAULT '{}',
  must_have_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  must_have_education TEXT[] NOT NULL DEFAULT '{}',
  must_have_experience JSONB NOT NULL DEFAULT '{}'::jsonb,

  nice_to_have_skills TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have_licenses TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have_certifications TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  nice_to_have_education TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have_experience JSONB NOT NULL DEFAULT '{}'::jsonb,

  hard_constraints JSONB NOT NULL DEFAULT '{}'::jsonb,

  parse_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  parse_sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_extraction_flags TEXT[] NOT NULL DEFAULT '{}',

  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jrn_must_have_skills_gin
  ON job_requirements_normalized USING GIN (must_have_skills);

CREATE INDEX IF NOT EXISTS idx_jrn_must_have_licenses_gin
  ON job_requirements_normalized USING GIN (must_have_licenses);

CREATE INDEX IF NOT EXISTS idx_jrn_must_have_certs_gin
  ON job_requirements_normalized USING GIN (must_have_certifications);

CREATE INDEX IF NOT EXISTS idx_jrn_nice_to_have_skills_gin
  ON job_requirements_normalized USING GIN (nice_to_have_skills);

CREATE INDEX IF NOT EXISTS idx_jrn_hard_constraints_gin
  ON job_requirements_normalized USING GIN (hard_constraints);

CREATE INDEX IF NOT EXISTS idx_jrn_parse_confidence
  ON job_requirements_normalized (parse_confidence DESC);

CREATE OR REPLACE FUNCTION set_job_requirements_normalized_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_requirements_normalized_updated_at
  ON job_requirements_normalized;

CREATE TRIGGER trg_job_requirements_normalized_updated_at
BEFORE UPDATE ON job_requirements_normalized
FOR EACH ROW
EXECUTE FUNCTION set_job_requirements_normalized_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON job_requirements_normalized TO service_role;
GRANT SELECT ON job_requirements_normalized TO authenticated;

COMMENT ON TABLE job_requirements_normalized IS 'Normalized requirements extracted from job_ads source_snapshot + description text';
