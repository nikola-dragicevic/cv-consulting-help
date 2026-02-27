-- Pre-order storage for CV/CV+letter document services.
-- Stripe remains financial source of truth; this table stores operational order/intake state.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.document_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'checkout_created', 'paid', 'failed', 'cancelled', 'in_progress', 'delivered')),

  package_name text NOT NULL,
  package_flow text NOT NULL
    CHECK (package_flow IN ('cv_intake', 'cv_letter_intake')),
  amount_sek integer NOT NULL CHECK (amount_sek >= 0),

  -- Searchable copies of important values from intake snapshot
  target_role text,
  target_job_link text,

  -- Full pre-order intake payload snapshot for fulfillment
  intake_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Stripe linkage (for operational reconciliation)
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_email text,
  stripe_status text,

  paid_at timestamptz,
  delivery_notes text,
  delivered_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_orders_target_job_link_len_chk
    CHECK (target_job_link IS NULL OR char_length(target_job_link) <= 2000),
  CONSTRAINT document_orders_target_job_link_protocol_chk
    CHECK (target_job_link IS NULL OR target_job_link ~* '^https?://')
);

CREATE INDEX IF NOT EXISTS document_orders_user_id_idx
  ON public.document_orders (user_id);

CREATE INDEX IF NOT EXISTS document_orders_created_at_idx
  ON public.document_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS document_orders_status_idx
  ON public.document_orders (status);

CREATE INDEX IF NOT EXISTS document_orders_package_flow_idx
  ON public.document_orders (package_flow);

CREATE INDEX IF NOT EXISTS document_orders_stripe_checkout_session_id_idx
  ON public.document_orders (stripe_checkout_session_id);

CREATE INDEX IF NOT EXISTS document_orders_intake_payload_gin_idx
  ON public.document_orders USING gin (intake_payload);

CREATE OR REPLACE FUNCTION public.set_document_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_orders_updated_at ON public.document_orders;
CREATE TRIGGER trg_document_orders_updated_at
BEFORE UPDATE ON public.document_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_document_orders_updated_at();

ALTER TABLE public.document_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own document orders" ON public.document_orders;
CREATE POLICY "Users can view own document orders"
ON public.document_orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own document orders" ON public.document_orders;
CREATE POLICY "Users can insert own document orders"
ON public.document_orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own document orders" ON public.document_orders;
CREATE POLICY "Users can update own document orders"
ON public.document_orders
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.document_orders TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.document_orders TO authenticated;

COMMENT ON TABLE public.document_orders IS 'Operational document-service orders and intake snapshots (CV/CV+letter). Stripe remains payment source of truth.';
COMMENT ON COLUMN public.document_orders.intake_payload IS 'Full intake snapshot captured at checkout creation time.';
