-- Create match_cache table to store user match results
-- This prevents expensive re-matching on every page load

CREATE TABLE IF NOT EXISTS match_cache (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Match results (full JSON response)
  match_results JSONB NOT NULL,

  -- Intent used for matching
  intent TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one cache entry per user
  UNIQUE(user_id)
);

-- Index for fast user lookups
CREATE INDEX idx_match_cache_user_id ON match_cache(user_id);

-- Index for cleanup queries (old caches)
CREATE INDEX idx_match_cache_updated_at ON match_cache(updated_at);

-- Add rate limiting field to candidate_profiles
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS last_match_time TIMESTAMPTZ DEFAULT NULL;

-- Index for rate limit checks
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_last_match_time
ON candidate_profiles(last_match_time);

-- Enable Row Level Security
ALTER TABLE match_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own cache
CREATE POLICY "Users can view their own match cache"
  ON match_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match cache"
  ON match_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match cache"
  ON match_cache
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON match_cache TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE match_cache_id_seq TO authenticated;

-- Comments
COMMENT ON TABLE match_cache IS 'Cached match results to prevent expensive re-matching on every page load. Users can refresh once per 24 hours.';
COMMENT ON COLUMN match_cache.match_results IS 'Full JSON response from match API including jobs, buckets, and metadata';
COMMENT ON COLUMN candidate_profiles.last_match_time IS 'Timestamp of last match execution - used for 24h rate limiting';
