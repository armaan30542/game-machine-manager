-- =============================================================
-- CABINET TYPES REFERENCE TABLE
-- Admin-managed list of cabinet types, mirroring machine_types.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.cabinet_types (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.cabinet_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view cabinet types" ON public.cabinet_types;
CREATE POLICY "Authenticated users can view cabinet types"
  ON public.cabinet_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage cabinet types" ON public.cabinet_types;
CREATE POLICY "Admins can manage cabinet types"
  ON public.cabinet_types
  FOR ALL TO authenticated USING ((SELECT public.is_admin()));

INSERT INTO public.cabinet_types (name) VALUES
  ('Single Metal'), ('Dual Metal'), ('Vertical 32'), ('Vertical 42'),
  ('Omega 42'), ('CG 42'), ('Hydra 42')
ON CONFLICT (name) DO NOTHING;
