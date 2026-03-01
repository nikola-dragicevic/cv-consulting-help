-- Cache dashboard match outputs per user + score mode + query key.
-- Purpose: avoid repeated expensive DB/RPC calls when users toggle score buttons.

CREATE TABLE IF NOT EXISTS dashboard_match_cache (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_mode TEXT NOT NULL CHECK (score_mode IN ('jobbnu', 'ats', 'taxonomy')),
  cache_key TEXT NOT NULL,
  match_results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, score_mode, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_match_cache_user_id
  ON dashboard_match_cache(user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_match_cache_updated_at
  ON dashboard_match_cache(updated_at);

ALTER TABLE dashboard_match_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboard match cache"
  ON dashboard_match_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dashboard match cache"
  ON dashboard_match_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboard match cache"
  ON dashboard_match_cache
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON dashboard_match_cache TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE dashboard_match_cache_id_seq TO authenticated;

COMMENT ON TABLE dashboard_match_cache IS
  'Cached dashboard results keyed by score mode + query footprint to reduce repeated matching load.';
