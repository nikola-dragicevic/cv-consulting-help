CREATE TABLE IF NOT EXISTS public.affiliate_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  social_handle text,
  status text NOT NULL DEFAULT 'active',
  commission_percent numeric(5,2) NOT NULL DEFAULT 30.00,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.affiliate_creators(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_email text,
  attribution_source text NOT NULL DEFAULT 'cookie_ref',
  affiliate_code text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  signup_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  dashboard_checkout_started_at timestamptz,
  auto_apply_checkout_started_at timestamptz,
  first_paid_at timestamptz,
  first_paid_order_type text,
  first_paid_amount_sek integer,
  payout_amount_sek integer,
  payout_status text NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id text,
  stripe_customer_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_creator_id
  ON public.affiliate_referrals(creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_payout_status
  ON public.affiliate_referrals(payout_status, created_at DESC);

ALTER TABLE public.affiliate_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'affiliate_creators'
      AND policyname = 'affiliate_creators_select_authenticated'
  ) THEN
    CREATE POLICY affiliate_creators_select_authenticated
      ON public.affiliate_creators
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'affiliate_referrals'
      AND policyname = 'affiliate_referrals_select_own'
  ) THEN
    CREATE POLICY affiliate_referrals_select_own
      ON public.affiliate_referrals
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
