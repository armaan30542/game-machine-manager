-- =============================================================
-- 009: Florida, cleared-period tracking, settlement estimates,
--      month-end snapshots and the partner settlement ledger.
-- Additive only: no existing rows are changed or removed.
-- =============================================================

-- -------------------------------------------------------------
-- FLORIDA as a third state
-- -------------------------------------------------------------
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_state_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_state_check CHECK (state IN ('VA', 'TX', 'FL'));

-- -------------------------------------------------------------
-- CLEARED PERIODS
-- One row each time a location's ksys22 period is cleared: the
-- final figures for the period that just ended. revenue_records
-- only ever holds the current (open) period, so this is the
-- history. settlement_ref is the ledger statement that claimed
-- the period as part of its estimate (NULL = not settled yet).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cleared_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  cleared_on date NOT NULL,
  cash_in numeric(12,2) NOT NULL DEFAULT 0.00,
  cash_out numeric(12,2) NOT NULL DEFAULT 0.00,
  net_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  company_share_pct numeric(5,2) NOT NULL,
  company_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  -- 'kpbd' = re-read from ksys22 Period by Date; 'last_seen' = the
  -- last figures fetched before the clear (used when kpbd fails).
  source text NOT NULL DEFAULT 'kpbd' CHECK (source IN ('kpbd', 'last_seen')),
  last_seen_net numeric(12,2),
  settlement_ref text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_cleared_location ON public.cleared_periods(location_id);
CREATE INDEX IF NOT EXISTS idx_cleared_settlement ON public.cleared_periods(settlement_ref);
CREATE INDEX IF NOT EXISTS idx_cleared_open ON public.cleared_periods(cleared_on)
  WHERE settlement_ref IS NULL;

ALTER TABLE public.cleared_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cleared periods"
  ON public.cleared_periods
  FOR SELECT TO authenticated USING (true);
-- Writes go through the service role (API routes and the daily job).

-- -------------------------------------------------------------
-- SETTLEMENT ESTIMATES
-- The estimate-versus-actual snapshot taken when a settlement
-- sheet is saved in the ledger: one row per statement and state.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id text NOT NULL,
  state text NOT NULL,
  statement_period text,
  sheet_date date,
  estimate numeric(12,2) NOT NULL DEFAULT 0.00,
  actual numeric(12,2),
  cleared_count integer NOT NULL DEFAULT 0,
  not_cleared_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_id, state)
);

ALTER TABLE public.settlement_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settlement estimates"
  ON public.settlement_estimates
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- -------------------------------------------------------------
-- MONTHLY SNAPSHOTS
-- The state of locations, machines and dispensers at the end of
-- a month ('YYYY-MM'). Two consecutive snapshots give the
-- month's changes.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_snapshots (
  month text PRIMARY KEY CHECK (month ~ '^\d{4}-\d{2}$'),
  taken_at timestamptz NOT NULL DEFAULT now(),
  is_baseline boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL
);

ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view monthly snapshots"
  ON public.monthly_snapshots
  FOR SELECT TO authenticated USING (true);

-- -------------------------------------------------------------
-- LEDGER DOCS
-- Document store for the partner settlement ledger (statements,
-- supporting documents, funded purchases, settings). Admin only:
-- it holds partner payouts.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_docs (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public.ledger_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ledger docs" ON public.ledger_docs
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins can insert ledger docs" ON public.ledger_docs
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins can update ledger docs" ON public.ledger_docs
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins can delete ledger docs" ON public.ledger_docs
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- Private bucket for the sheet images. Read and written only through
-- /api/ledger/image with the service role, so it needs no policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ledger', 'ledger', false)
ON CONFLICT (id) DO NOTHING;
