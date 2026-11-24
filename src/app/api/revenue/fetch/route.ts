import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { refreshLocationRevenue, logFetchFailure } from "@/lib/clears";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { location_id } = await request.json();

  const { data: location } = await supabase
    .from("locations")
    .select("id, revenue_url, percentage_share, fees")
    .eq("id", location_id)
    .single();

  if (!location?.revenue_url) {
    return NextResponse.json(
      { error: "No revenue URL for this location" },
      { status: 400 }
    );
  }

  // Service role client: replacing the open-period row needs to bypass RLS.
  const serviceClient = createAdminClient();

  try {
    const { parsed, companyRevenue, cleared } = await refreshLocationRevenue(
      serviceClient,
      {
        id: location.id,
        revenue_url: location.revenue_url,
        percentage_share: location.percentage_share,
        fees: location.fees,
      }
    );

    await supabase.from("audit_log").insert({
      action: "revenue_fetched",
      performed_by: user.id,
      location_id,
      details: {
        cash_in: parsed.cash_in,
        cash_out: parsed.cash_out,
        net_revenue: parsed.net_revenue,
        company_revenue: companyRevenue,
        ...(cleared && { cleared_period: cleared }),
      },
    });

    return NextResponse.json({
      success: true,
      company_revenue: companyRevenue,
      data: parsed,
      cleared,
    });
  } catch (err) {
    console.error("Revenue fetch error:", err);
    await logFetchFailure(serviceClient, location.id, err, user.id);
    return NextResponse.json(
      { error: "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
