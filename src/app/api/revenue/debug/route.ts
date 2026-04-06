import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRevenueResponse } from "@/lib/revenue-parser";

export const maxDuration = 30;

function getSession(res: Response): string {
  const cookies: string[] = [];
  if (res.headers.getSetCookie) cookies.push(...res.headers.getSetCookie());
  res.headers.forEach((v, k) => {
    if (k.toLowerCase() === "set-cookie" && !cookies.includes(v)) cookies.push(v);
  });
  for (const c of cookies) {
    const m = c.match(/PHPSESSID=([^;]+)/);
    if (m) return m[1];
  }
  return "";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: location } = await supabase
    .from("locations")
    .select("id, location_number, name, revenue_url")
    .not("revenue_url", "is", null)
    .limit(1)
    .single();

  if (!location?.revenue_url) return NextResponse.json({ error: "No locations with revenue URLs" });

  const username = process.env.REVENUE_API_USERNAME || "";
  const password = process.env.REVENUE_API_PASSWORD || "";
  const baseUrl = location.revenue_url.endsWith("/")
    ? location.revenue_url
    : location.revenue_url + "/";

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  const log: unknown[] = [];

  try {
    // Step 1: GET login page
    const loginRes = await fetch(baseUrl, { redirect: "manual", headers });
    let sessionId = getSession(loginRes) || "";
    const loginHtml = await loginRes.text();

    // Parse form
    const inputs = [...loginHtml.matchAll(/<input[^>]*>/gi)];
    let usernameField = "", passwordField = "", submitName = "", submitValue = "";
    for (const input of inputs) {
      const tag = input[0];
      const t = (tag.match(/type=['"]?(\w+)['"]?/i)?.[1] || "text").toLowerCase();
      const n = tag.match(/name=['"]?([^'">\s]+)['"]?/i)?.[1] || "";
      if (!n) continue;
      if (t === "text") usernameField = n;
      else if (t === "password") passwordField = n;
      else if (t === "submit") {
        submitName = n;
        submitValue = (tag.match(/value=['"]([^'"]*)['"]/i) || tag.match(/value=(\S+)/i))?.[1] || "";
      }
    }

    log.push({
      step: "1_GET_login",
      status: loginRes.status,
      session: sessionId.substring(0, 8),
      fields: { usernameField, passwordField, submit: `${submitName}=${submitValue}` },
    });

    // Step 2: POST login
    const formData = new FormData();
    formData.append(usernameField, username);
    formData.append(passwordField, password);
    if (submitName) formData.append(submitName, submitValue);

    const postRes = await fetch(baseUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...headers,
        Cookie: `PHPSESSID=${sessionId}`,
        Referer: baseUrl,
        Origin: new URL(baseUrl).origin,
      },
      body: formData,
    });

    const postSid = getSession(postRes);
    if (postSid) sessionId = postSid;
    const postRedirect = postRes.headers.get("location") || "";

    log.push({
      step: "2_POST_login",
      status: postRes.status,
      redirect: postRedirect,
      newSession: postSid ? postSid.substring(0, 8) : "none",
    });

    // Step 3: Follow ALL redirects manually, collecting cookies
    let currentRes = postRes;
    let redirectCount = 0;
    while (
      redirectCount < 10 &&
      (currentRes.status === 301 || currentRes.status === 302 || currentRes.status === 303)
    ) {
      const loc = currentRes.headers.get("location");
      if (!loc) break;
      await currentRes.text(); // consume body

      const nextUrl = loc.startsWith("http") ? loc : new URL(loc, baseUrl).toString();
      currentRes = await fetch(nextUrl, {
        redirect: "manual",
        headers: {
          ...headers,
          Cookie: `PHPSESSID=${sessionId}`,
          Referer: baseUrl,
        },
      });

      const rSid = getSession(currentRes);
      if (rSid) sessionId = rSid;

      redirectCount++;
      log.push({
        step: `3_redirect_${redirectCount}`,
        url: nextUrl,
        status: currentRes.status,
        redirect: currentRes.headers.get("location") || "",
        newSession: rSid ? rSid.substring(0, 8) : "same",
      });
    }

    const postBody = await currentRes.text();
    log.push({
      step: "4_final_after_redirects",
      isLoginPage: postBody.includes("klogin.css"),
      bodyLength: postBody.length,
      bodyPreview: postBody.substring(0, 300),
    });

    // Step 5: GET kperiod.php
    const periodRes = await fetch(baseUrl + "kperiod.php", {
      headers: {
        ...headers,
        Cookie: `PHPSESSID=${sessionId}`,
        Referer: baseUrl,
      },
    });

    const periodHtml = await periodRes.text();
    const isLoginPage = periodHtml.includes("klogin.css");
    const hasTotals = periodHtml.includes("Totals");

    log.push({
      step: "5_GET_kperiod",
      status: periodRes.status,
      isLoginPage,
      hasTotals,
      htmlLength: periodHtml.length,
      htmlPreview: periodHtml.substring(0, 500),
    });

    let parsed = null;
    if (!isLoginPage && hasTotals) {
      parsed = parseRevenueResponse(periodHtml);
    }

    return NextResponse.json({
      location: `${location.location_number} - ${location.name}`,
      env: { user_len: username.length, pass_len: password.length, user_start: username.substring(0, 2) },
      success: !isLoginPage && hasTotals,
      parsed,
      log,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), log });
  }
}
