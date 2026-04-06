ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_notes text;
