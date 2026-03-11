-- =============================================================
-- PROFILES TABLE (extends auth.users)
-- =============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'reporting' CHECK (role IN ('admin', 'reporting')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(
      CASE WHEN NEW.raw_user_meta_data ->> 'role' IN ('admin', 'reporting')
           THEN NEW.raw_user_meta_data ->> 'role'
           ELSE NULL END,
      'reporting'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- LOCATIONS TABLE
-- =============================================================
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_number text UNIQUE NOT NULL,
  name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  county text,
  state text NOT NULL CHECK (state IN ('VA', 'TX')),
  zipcode text NOT NULL,
  phone text,
  email text,
  contact_name text,
  contact_phone text,
  has_contract boolean NOT NULL DEFAULT false,
  percentage_share numeric(5,2) NOT NULL DEFAULT 50.00
    CHECK (percentage_share >= 0 AND percentage_share <= 100),
  fees numeric(10,2) NOT NULL DEFAULT 0.00,
  revenue_url text,
  comments text,
  close_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- MACHINES TABLE
-- location_id IS NULL = in inventory
-- location_id = X = deployed to location X
-- =============================================================
CREATE TABLE public.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_type text NOT NULL,
  cabinet_type text NOT NULL,
  serial_number text UNIQUE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  position_at_location smallint,
  photo_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- DISPENSERS TABLE
-- Same pattern as machines. UNIQUE on location_id = max 1 per location.
-- =============================================================
CREATE TABLE public.dispensers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text UNIQUE,
  location_id uuid UNIQUE REFERENCES public.locations(id) ON DELETE SET NULL,
  dispenser_cash numeric(10,2) DEFAULT 0.00,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER dispensers_updated_at
  BEFORE UPDATE ON public.dispensers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- REVENUE RECORDS TABLE
-- =============================================================
CREATE TABLE public.revenue_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  cash_in numeric(12,2) NOT NULL DEFAULT 0.00,
  cash_out numeric(12,2) NOT NULL DEFAULT 0.00,
  net_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  company_share_pct numeric(5,2) NOT NULL,
  company_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, period_start, period_end)
);

-- =============================================================
-- AUDIT LOG TABLE (immutable)
-- =============================================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  dispenser_id uuid REFERENCES public.dispensers(id) ON DELETE SET NULL,
  details jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- MACHINE TYPES REFERENCE TABLE
-- =============================================================
CREATE TABLE public.machine_types (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_machines_location ON public.machines(location_id);
CREATE INDEX idx_machines_type ON public.machines(machine_type);
CREATE INDEX idx_machines_inventory ON public.machines(location_id) WHERE location_id IS NULL;
CREATE INDEX idx_locations_state ON public.locations(state);
CREATE INDEX idx_locations_active ON public.locations(close_date) WHERE close_date IS NULL;
CREATE INDEX idx_dispensers_location ON public.dispensers(location_id);
CREATE INDEX idx_revenue_location ON public.revenue_records(location_id);
CREATE INDEX idx_revenue_period ON public.revenue_records(period_start, period_end);
CREATE INDEX idx_audit_action ON public.audit_log(action);
CREATE INDEX idx_audit_location ON public.audit_log(location_id);
CREATE INDEX idx_audit_machine ON public.audit_log(machine_id);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);
