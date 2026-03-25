CREATE TABLE IF NOT EXISTS public.candidate_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_id text,
  email text,
  display_name text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'revoked', 'error')),
  scopes text[] NOT NULL DEFAULT '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  last_tested_at timestamptz,
  last_error text,
  connected_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  disconnected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_email_accounts_user_provider
  ON public.candidate_email_accounts(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_candidate_email_accounts_user
  ON public.candidate_email_accounts(user_id, created_at DESC);

ALTER TABLE public.candidate_email_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own email accounts" ON public.candidate_email_accounts;
CREATE POLICY "Users can view own email accounts"
  ON public.candidate_email_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own email accounts" ON public.candidate_email_accounts;
CREATE POLICY "Users can insert own email accounts"
  ON public.candidate_email_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own email accounts" ON public.candidate_email_accounts;
CREATE POLICY "Users can update own email accounts"
  ON public.candidate_email_accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own email accounts" ON public.candidate_email_accounts;
CREATE POLICY "Users can delete own email accounts"
  ON public.candidate_email_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can do anything on candidate email accounts" ON public.candidate_email_accounts;
CREATE POLICY "Service role can do anything on candidate email accounts"
  ON public.candidate_email_accounts
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_email_accounts TO authenticated;
GRANT ALL ON public.candidate_email_accounts TO service_role;

DROP TRIGGER IF EXISTS trg_candidate_email_accounts_updated_at ON public.candidate_email_accounts;
CREATE TRIGGER trg_candidate_email_accounts_updated_at
BEFORE UPDATE ON public.candidate_email_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
