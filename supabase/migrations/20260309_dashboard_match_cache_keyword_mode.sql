-- Replace legacy dashboard score modes with the current two-mode setup.
-- Keep backward compatibility for old cached rows by allowing both old and new
-- labels during rollout, but prefer `keyword_match` from the API.

ALTER TABLE dashboard_match_cache
  DROP CONSTRAINT IF EXISTS dashboard_match_cache_score_mode_check;

ALTER TABLE dashboard_match_cache
  ADD CONSTRAINT dashboard_match_cache_score_mode_check
  CHECK (score_mode IN ('jobbnu', 'ats', 'keyword_match', 'taxonomy'));
