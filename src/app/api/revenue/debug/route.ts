import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Fetch a sample revenue URL to inspect the response format
  const { data: location } = await supabase
    .from("locations")
    .select("id, location_number, name, revenue_url")
    .not("revenue_url", "is", null)
    .limit(1)
    .single();

  if (!location?.revenue_url) {
    return NextResponse.json({ error: "No locations with revenue URLs found" });
  }

  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  const headers: Record<string, string> = {};
  if (username && password) {
    headers["Authorization"] = `Basic ${Buffer.from(
      `${username}:${password}`
    ).toString("base64")}`;
  }

  try {
    const response = await fetch(location.revenue_url, { headers });
    const status = response.status;
    const contentType = response.headers.get("content-type");
    const rawData = await response.text();

    return NextResponse.json({
      location: {
        id: location.id,
        location_number: location.location_number,
        name: location.name,
        revenue_url: location.revenue_url,
      },
      response: {
        status,
        contentType,
        bodyLength: rawData.length,
        bodyPreview: rawData.substring(0, 5000),
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: "Fetch failed",
      details: String(err),
    });
  }
}
