import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRevenueResponse } from "@/lib/revenue-parser";

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

  const { data: locations } = await supabase
    .from("locations")
    .select("id, location_number, name, revenue_url, percentage_share, fees")
    .not("revenue_url", "is", null)
    .is("close_date", null);

  const results: {
    location_number: string;
    status: string;
    company_revenue?: number;
    error?: string;
  }[] = [];

  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  for (const loc of locations || []) {
    try {
      const headers: Record<string, string> = {};
      if (username && password) {
        headers["Authorization"] = `Basic ${Buffer.from(
          `${username}:${password}`
        ).toString("base64")}`;
      }

      const response = await fetch(loc.revenue_url!, { headers });
      const rawData = await response.text();

      const parsed = parseRevenueResponse(rawData);

      const feeAmount = Number(loc.fees);
      const sharePercent = Number(loc.percentage_share);
      const companyRevenue =
        (parsed.net_revenue - feeAmount) * (sharePercent / 100);

      await supabase.from("revenue_records").upsert(
        {
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
        },
        { onConflict: "location_id,period_start,period_end" }
      );

      results.push({
        location_number: loc.location_number,
        status: "success",
        company_revenue: companyRevenue,
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

  await supabase.from("audit_log").insert({
    action: "revenue_fetched",
    performed_by: user.id,
    details: {
      batch: true,
      total: locations?.length ?? 0,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
    },
  });

  return NextResponse.json({ results });
}
