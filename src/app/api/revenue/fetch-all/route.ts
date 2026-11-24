import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { refreshLocationRevenue, logFetchFailure } from "@/lib/clears";

export const maxDuration = 60;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // Service role client: replacing the open-period rows needs to bypass RLS.
  const serviceClient = createAdminClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, location_number, name, revenue_url, percentage_share, fees")
    .not("revenue_url", "is", null)
    .is("close_date", null);

  const results: {
    location_number: string;
    status: string;
    company_revenue?: number;
    cash_in?: number;
    cash_out?: number;
    net_revenue?: number;
    cleared?: boolean;
    error?: string;
  }[] = [];

  for (const loc of locations || []) {
    try {
      const { parsed, companyRevenue, cleared } = await refreshLocationRevenue(
        serviceClient,
        {
          id: loc.id,
          revenue_url: loc.revenue_url!,
          percentage_share: loc.percentage_share,
          fees: loc.fees,
        }
      );

      // Log per-location so entries appear even if the route times out
      // before the whole batch finishes.
      await supabase.from("audit_log").insert({
        action: "revenue_fetched",
        performed_by: user.id,
        location_id: loc.id,
        details: {
          cash_in: parsed.cash_in,
          cash_out: parsed.cash_out,
          net_revenue: parsed.net_revenue,
          company_revenue: companyRevenue,
          ...(cleared && { cleared_period: cleared }),
        },
      });

      results.push({
        location_number: loc.location_number,
        status: "success",
        company_revenue: companyRevenue,
        cash_in: parsed.cash_in,
        cash_out: parsed.cash_out,
        net_revenue: parsed.net_revenue,
        cleared: !!cleared,
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      await logFetchFailure(serviceClient, loc.id, err, user.id);
      results.push({
        location_number: loc.location_number,
        status: "error",
        error: String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
