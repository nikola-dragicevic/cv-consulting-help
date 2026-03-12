-- Track expensive dashboard "Matcha jobb" executions separately from the old intent flow.
-- Policy goal: allow 3 base-pool runs per rolling 24h window; score switching reads saved results.

CREATE TABLE IF NOT EXISTS dashboard_match_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_match_runs_user_created_at
  ON dashboard_match_runs(user_id, created_at DESC);

ALTER TABLE dashboard_match_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboard match runs"
  ON dashboard_match_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dashboard match runs"
  ON dashboard_match_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON dashboard_match_runs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE dashboard_match_runs_id_seq TO authenticated;
