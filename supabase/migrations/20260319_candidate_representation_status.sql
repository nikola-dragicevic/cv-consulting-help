ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS representation_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS representation_status text,
  ADD COLUMN IF NOT EXISTS representation_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS representation_subscription_id text,
  ADD COLUMN IF NOT EXISTS representation_customer_id text,
  ADD COLUMN IF NOT EXISTS representation_started_at timestamptz;
