-- =============================================================
-- 010: Weekly revenue totals and phone push notifications.
-- Additive only: no existing rows are changed or removed.
-- =============================================================

-- -------------------------------------------------------------
-- WEEKLY REVENUE
-- One row per location per calendar week (Monday to Sunday),
-- read from ksys22 "Period by Date" by the Monday job. Reading
-- by date means a clear in the middle of a week does not distort
-- the week's total.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_revenue (
  week_start date NOT NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  state text NOT NULL,
  cash_in numeric(12,2) NOT NULL DEFAULT 0.00,
  cash_out numeric(12,2) NOT NULL DEFAULT 0.00,
  net_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  company_share_pct numeric(5,2) NOT NULL,
  company_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, location_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_revenue_week ON public.weekly_revenue(week_start);

ALTER TABLE public.weekly_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view weekly revenue"
  ON public.weekly_revenue
  FOR SELECT TO authenticated USING (true);
-- Written only by the Monday job, through the service role.

-- -------------------------------------------------------------
-- PUSH SUBSCRIPTIONS
-- One row per device that has turned notifications on. A person
-- can see and remove only their own devices; sending goes through
-- the service role.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Inserts go through /api/push/subscribe (service role), which sets
-- user_id from the signed-in session.

-- -------------------------------------------------------------
-- APP CONFIG
-- Server-only settings the app creates for itself: the push
-- signing keys and a marker for each weekly notification sent.
-- RLS is on with no policies, so only the service role can read
-- or write it.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
