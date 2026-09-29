import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseRevenueResponse,
  parseDeviceList,
  applyDeviceNames,
} from "@/lib/revenue-parser";
import { fetchRevenuePage } from "@/lib/revenue-fetch";

export const maxDuration = 30;

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

  // Use service role client to bypass RLS for delete operations
  const serviceClient = createAdminClient();

  try {
    // 1. Fetch and parse revenue data first
    const { revenueHtml, deviceHtml } = await fetchRevenuePage(
      location.revenue_url
    );
    const parsed = parseRevenueResponse(revenueHtml);
    const machineLines = applyDeviceNames(
      parsed.machine_lines,
      parseDeviceList(deviceHtml)
    );

    const feeAmount = Number(location.fees);
    const sharePercent = Number(location.percentage_share);
    const companyRevenue =
      (parsed.net_revenue - feeAmount) * (sharePercent / 100);

    // 2. Only delete old records after we have valid new data
    const { error: deleteError } = await serviceClient
      .from("revenue_records")
      .delete()
      .eq("location_id", location_id);

    if (deleteError) {
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    // 3. Insert new record
    const { data: newRecord, error: insertError } = await serviceClient
      .from("revenue_records")
      .insert({
        location_id,
        period_start: parsed.period_start,
        period_end: parsed.period_end,
        cash_in: parsed.cash_in,
        cash_out: parsed.cash_out,
        net_revenue: parsed.net_revenue,
        fee_amount: feeAmount,
        company_share_pct: sharePercent,
        company_revenue: companyRevenue,
        raw_data: revenueHtml,
        fetched_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    // 4. Insert per-machine breakdown (best effort - must not fail the fetch)
    if (newRecord && machineLines.length > 0) {
      const { error: linesError } = await serviceClient
        .from("revenue_machine_lines")
        .insert(
          machineLines.map((l) => ({
            revenue_record_id: newRecord.id,
            location_id,
            position: l.position,
            ksys_game_id: l.ksys_game_id,
            game_name: l.game_name,
            cash_in: l.cash_in,
            cash_out: l.cash_out,
            net_revenue: l.net_revenue,
            last_read_date: l.last_read_date,
          }))
        );
      if (linesError) {
        console.error("Machine lines insert error:", linesError.message);
      }
    }

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
