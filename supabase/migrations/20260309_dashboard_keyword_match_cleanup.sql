-- Rename the dashboard keyword-only mode from `ats` to `keyword_match`
-- across cache, state, and the sorting RPC.

UPDATE dashboard_match_cache
SET score_mode = 'keyword_match'
WHERE score_mode = 'ats';

UPDATE dashboard_match_cache
SET score_mode = 'jobbnu'
WHERE score_mode = 'taxonomy';

ALTER TABLE dashboard_match_cache
  DROP CONSTRAINT IF EXISTS dashboard_match_cache_score_mode_check;

ALTER TABLE dashboard_match_cache
  ADD CONSTRAINT dashboard_match_cache_score_mode_check
  CHECK (score_mode IN ('jobbnu', 'keyword_match'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_match_state'
      AND column_name = 'ats_job_ids'
  ) THEN
    ALTER TABLE dashboard_match_state RENAME COLUMN ats_job_ids TO keyword_match_job_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_match_state'
      AND column_name = 'ats_updated_at'
  ) THEN
    ALTER TABLE dashboard_match_state RENAME COLUMN ats_updated_at TO keyword_match_updated_at;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_match_state'
      AND column_name = 'taxonomy_job_ids'
  ) THEN
    ALTER TABLE dashboard_match_state DROP COLUMN taxonomy_job_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_match_state'
      AND column_name = 'taxonomy_updated_at'
  ) THEN
    ALTER TABLE dashboard_match_state DROP COLUMN taxonomy_updated_at;
  END IF;
END $$;
