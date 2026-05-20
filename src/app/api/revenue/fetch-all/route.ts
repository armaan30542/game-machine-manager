import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRevenueResponse } from "@/lib/revenue-parser";
import { fetchRevenuePage } from "@/lib/revenue-fetch";

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use service role client to bypass RLS for delete operations
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
    error?: string;
  }[] = [];

  for (const loc of locations || []) {
    try {
      // 1. Fetch and parse revenue data first
      const rawData = await fetchRevenuePage(loc.revenue_url!);
      const parsed = parseRevenueResponse(rawData);

      const feeAmount = Number(loc.fees);
      const sharePercent = Number(loc.percentage_share);
      const companyRevenue =
        (parsed.net_revenue - feeAmount) * (sharePercent / 100);

      // 2. Only delete old records after we have valid new data
      const { error: deleteError } = await serviceClient
        .from("revenue_records")
        .delete()
        .eq("location_id", loc.id);

      if (deleteError) {
        throw new Error(`Delete failed: ${deleteError.message}`);
      }

      // 3. Insert new record
      const { error: insertError } = await serviceClient
        .from("revenue_records")
        .insert({
          location_id: loc.id,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          cash_in: parsed.cash_in,
          cash_out: parsed.cash_out,
          net_revenue: parsed.net_revenue,
          fee_amount: feeAmount,
          company_share_pct: sharePercent,
          company_revenue: companyRevenue,
          raw_data: rawData,
          fetched_at: new Date().toISOString(),
        });

      if (insertError) {
        throw new Error(`Insert failed: ${insertError.message}`);
      }

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
        },
      });

      results.push({
        location_number: loc.location_number,
        status: "success",
        company_revenue: companyRevenue,
        cash_in: parsed.cash_in,
        cash_out: parsed.cash_out,
        net_revenue: parsed.net_revenue,
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      results.push({
        location_number: loc.location_number,
        status: "error",
        error: String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
