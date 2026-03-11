-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_types ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- PROFILES
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));

-- LOCATIONS
CREATE POLICY "Authenticated users can view locations" ON public.locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create locations" ON public.locations
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins can update locations" ON public.locations
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins can delete locations" ON public.locations
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- MACHINES
CREATE POLICY "Authenticated users can view machines" ON public.machines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create machines" ON public.machines
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins can update machines" ON public.machines
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins can delete machines" ON public.machines
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- DISPENSERS
CREATE POLICY "Authenticated users can view dispensers" ON public.dispensers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create dispensers" ON public.dispensers
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins can update dispensers" ON public.dispensers
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins can delete dispensers" ON public.dispensers
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- REVENUE RECORDS
CREATE POLICY "Authenticated users can view revenue" ON public.revenue_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert revenue" ON public.revenue_records
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins can update revenue" ON public.revenue_records
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin()));

-- AUDIT LOG (immutable - no update/delete policies)
CREATE POLICY "Authenticated users can view audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert audit log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

-- MACHINE TYPES
CREATE POLICY "Authenticated users can view machine types" ON public.machine_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage machine types" ON public.machine_types
  FOR ALL TO authenticated USING ((SELECT public.is_admin()));
