import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRevenueResponse } from "@/lib/revenue-parser";

export const maxDuration = 30;

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

  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;
  const baseUrl = location.revenue_url.endsWith("/")
    ? location.revenue_url
    : location.revenue_url + "/";

  const steps: Record<string, unknown> = {};

  try {
    // Step 1: GET login page
    const loginPageRes = await fetch(baseUrl, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const loginCookies: string[] = [];
    loginPageRes.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie") loginCookies.push(v);
    });
    if (loginPageRes.headers.getSetCookie) {
      loginCookies.push(...loginPageRes.headers.getSetCookie());
    }

    let sessionId = "";
    for (const c of loginCookies) {
      const m = c.match(/PHPSESSID=([^;]+)/);
      if (m) sessionId = m[1];
    }

    const loginHtml = await loginPageRes.text();

    // Parse form fields
    const inputs = [...loginHtml.matchAll(/<input[^>]*>/gi)];
    const formFields: { type: string; name: string; value?: string }[] = [];
    let usernameField = "";
    let passwordField = "";
    const hiddenFields: Record<string, string> = {};

    for (const input of inputs) {
      const tag = input[0];
      const typeMatch = tag.match(/type=['"]?(\w+)['"]?/i);
      const nameMatch = tag.match(/name=['"]?([^'">\s]+)['"]?/i);
      const valueMatch = tag.match(/value=['"]?([^'">\s]*)['"]?/i);

      if (!nameMatch) continue;
      const name = nameMatch[1];
      const type = (typeMatch?.[1] || "text").toLowerCase();

      formFields.push({ type, name, value: valueMatch?.[1] });

      if (type === "text") usernameField = name;
      else if (type === "password") passwordField = name;
      else if (type === "hidden") hiddenFields[name] = valueMatch?.[1] || "";
    }

    steps.step1_login_page = {
      status: loginPageRes.status,
      sessionId: sessionId ? sessionId.substring(0, 10) + "..." : "none",
      formFields,
      usernameField,
      passwordField,
      hiddenFields,
      htmlPreview: loginHtml.substring(0, 500),
    };

    // Step 2: POST login
    const boundary =
      "----FormBoundary" + Math.random().toString(36).slice(2);
    const postFields: Record<string, string> = {
      ...hiddenFields,
      [usernameField]: username || "",
      [passwordField]: password || "",
    };

    let body = "";
    for (const [key, value] of Object.entries(postFields)) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;

    const loginRes = await fetch(baseUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Cookie: sessionId ? `PHPSESSID=${sessionId}` : "",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: baseUrl,
      },
      body,
    });

    const loginResCookies: string[] = [];
    loginRes.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie") loginResCookies.push(v);
    });
    if (loginRes.headers.getSetCookie) {
      loginResCookies.push(...loginRes.headers.getSetCookie());
    }
    for (const c of loginResCookies) {
      const m = c.match(/PHPSESSID=([^;]+)/);
      if (m) sessionId = m[1];
    }

    const redirectUrl = loginRes.headers.get("location") || "";
    const loginResBody = await loginRes.text();

    steps.step2_login_post = {
      status: loginRes.status,
      redirect: redirectUrl,
      newSessionId: sessionId ? sessionId.substring(0, 10) + "..." : "none",
      postFieldNames: Object.keys(postFields),
      responsePreview: loginResBody.substring(0, 500),
    };

    // Step 3: GET period page
    const periodUrl = baseUrl + "kperiod.php";
    const periodRes = await fetch(periodUrl, {
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: baseUrl,
      },
    });

    const html = await periodRes.text();
    const isLoginPage = html.includes("klogin.css");
    const hasTotals = html.includes("Totals");

    steps.step3_period_page = {
      status: periodRes.status,
      htmlLength: html.length,
      isLoginPage,
      hasTotals,
      htmlPreview: html.substring(0, 1000),
    };

    if (!isLoginPage) {
      const parsed = parseRevenueResponse(html);
      steps.parsed = parsed;
    }

    return NextResponse.json({
      location: `${location.location_number} - ${location.name}`,
      revenue_url: location.revenue_url,
      steps,
    });
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      location: `${location.location_number} - ${location.name}`,
      revenue_url: location.revenue_url,
      steps,
    });
  }
}
