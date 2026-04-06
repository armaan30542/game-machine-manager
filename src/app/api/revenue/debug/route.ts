import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRevenuePage } from "@/lib/revenue-fetch";
import { parseRevenueResponse } from "@/lib/revenue-parser";

export async function GET() {
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

  const { data: location } = await supabase
    .from("locations")
    .select("id, location_number, name, revenue_url")
    .not("revenue_url", "is", null)
    .limit(1)
    .single();

  if (!location?.revenue_url) {
    return NextResponse.json({ error: "No locations with revenue URLs" });
  }

  try {
    const rawHtml = await fetchRevenuePage(location.revenue_url);
    const parsed = parseRevenueResponse(rawHtml);

    return NextResponse.json({
      location: `${location.location_number} - ${location.name}`,
      revenue_url: location.revenue_url,
      html_length: rawHtml.length,
      html_preview: rawHtml.substring(0, 3000),
      parsed,
    });
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      location: `${location.location_number} - ${location.name}`,
      revenue_url: location.revenue_url,
    });
  }
}
