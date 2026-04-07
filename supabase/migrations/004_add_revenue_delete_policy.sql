-- Add missing DELETE policy for revenue_records
-- Without this, RLS silently blocks all DELETE operations on the table
CREATE POLICY "Admins can delete revenue" ON public.revenue_records
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));
