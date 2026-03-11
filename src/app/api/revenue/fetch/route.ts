import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRevenueResponse } from "@/lib/revenue-parser";

export async function POST(request: NextRequest) {
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

  const { location_id } = await request.json();

  const { data: location } = await supabase
    .from("locations")
    .select("revenue_url, percentage_share, fees")
    .eq("id", location_id)
    .single();

  if (!location?.revenue_url) {
    return NextResponse.json(
      { error: "No revenue URL for this location" },
      { status: 400 }
    );
  }

  try {
    const username = process.env.REVENUE_API_USERNAME;
    const password = process.env.REVENUE_API_PASSWORD;

    const headers: Record<string, string> = {};
    if (username && password) {
      headers["Authorization"] = `Basic ${Buffer.from(
        `${username}:${password}`
      ).toString("base64")}`;
    }

    const response = await fetch(location.revenue_url, { headers });
    const rawData = await response.text();

    const parsed = parseRevenueResponse(rawData);

    const feeAmount = Number(location.fees);
    const sharePercent = Number(location.percentage_share);
    const companyRevenue =
      (parsed.net_revenue - feeAmount) * (sharePercent / 100);

    const { error } = await supabase.from("revenue_records").upsert(
      {
        location_id,
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

    if (error) throw error;

    await supabase.from("audit_log").insert({
      action: "revenue_fetched",
      performed_by: user.id,
      location_id,
      details: {
        cash_in: parsed.cash_in,
        cash_out: parsed.cash_out,
        net_revenue: parsed.net_revenue,
        company_revenue: companyRevenue,
      },
    });

    return NextResponse.json({
      success: true,
      company_revenue: companyRevenue,
      data: parsed,
    });
  } catch (err) {
    console.error("Revenue fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
