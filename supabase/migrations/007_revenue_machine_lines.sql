-- =============================================================
-- REVENUE MACHINE LINES
-- Per-machine (per-game) breakdown for a revenue_records row.
-- Cleared automatically via ON DELETE CASCADE when the parent
-- revenue_records row is deleted (the fetch flow is delete-then-insert).
-- =============================================================
CREATE TABLE public.revenue_machine_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_record_id uuid NOT NULL
    REFERENCES public.revenue_records(id) ON DELETE CASCADE,
  location_id uuid NOT NULL
    REFERENCES public.locations(id) ON DELETE CASCADE,
  position smallint,
  ksys_game_id text,
  game_name text NOT NULL,
  cash_in numeric(12,2) NOT NULL DEFAULT 0.00,
  cash_out numeric(12,2) NOT NULL DEFAULT 0.00,
  net_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  last_read_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rml_record ON public.revenue_machine_lines(revenue_record_id);
CREATE INDEX idx_rml_location ON public.revenue_machine_lines(location_id);
CREATE INDEX idx_rml_last_read ON public.revenue_machine_lines(last_read_date);

ALTER TABLE public.revenue_machine_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view machine lines"
  ON public.revenue_machine_lines
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert machine lines"
  ON public.revenue_machine_lines
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can update machine lines"
  ON public.revenue_machine_lines
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));

-- Required so an admin deleting a revenue_records row succeeds via cascade.
CREATE POLICY "Admins can delete machine lines"
  ON public.revenue_machine_lines
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));
