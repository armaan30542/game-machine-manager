import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRevenueResponse } from "@/lib/revenue-parser";
import { fetchRevenueByDate } from "@/lib/revenue-fetch";

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

  const { location_id, start_date, end_date, log_run } = await request.json();

  if (!location_id || !start_date || !end_date) {
    return NextResponse.json(
      { error: "location_id, start_date and end_date are required" },
      { status: 400 }
    );
  }
  if (start_date > end_date) {
    return NextResponse.json(
      { error: "Start date must be on or before end date" },
      { status: 400 }
    );
  }

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
    const rawData = await fetchRevenueByDate(
      location.revenue_url,
      start_date,
      end_date
    );
    const parsed = parseRevenueResponse(rawData);

    const feeAmount = Number(location.fees);
    const sharePercent = Number(location.percentage_share);
    const companyRevenue =
      (parsed.net_revenue - feeAmount) * (sharePercent / 100);

    // Display-only feature: it does not persist revenue rows. The client
    // sets log_run on exactly one location per run so the activity log
    // gets a single "Revenue by Date" entry instead of one per location.
    if (log_run) {
      await supabase.from("audit_log").insert({
        action: "revenue_by_date_run",
        performed_by: user.id,
        details: { start_date, end_date },
      });
    }

    return NextResponse.json({
      cash_in: parsed.cash_in,
      cash_out: parsed.cash_out,
      net_revenue: parsed.net_revenue,
      period_start: start_date,
      period_end: end_date,
      machine_lines: parsed.machine_lines,
      fee_amount: feeAmount,
      company_share_pct: sharePercent,
      company_revenue: companyRevenue,
      // When the per-machine list comes back empty, surface a slice of the
      // raw kpbd.php response so the parser can be adjusted to whatever
      // markup ksys22 actually returns.
      ...(parsed.machine_lines.length === 0 && {
        _debug: {
          html_length: rawData.length,
          is_login_page: rawData.includes("klogin.css"),
          tr_count: (rawData.match(/<tr/gi) ?? []).length,
          tables: [...rawData.matchAll(/<table[\s\S]*?<\/table>/gi)]
            .map((m) => m[0])
            .slice(0, 4),
          html_full: rawData.substring(0, 20000),
        },
      }),
    });
  } catch (err) {
    console.error("Revenue by-date error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
