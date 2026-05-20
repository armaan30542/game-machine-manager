import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Client } from "undici";
import { parseRevenueResponse } from "@/lib/revenue-parser";
import { fetchRevenueByDate } from "@/lib/revenue-fetch";

export const maxDuration = 30;

function extractSession(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers["set-cookie"];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const c of arr) {
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
  const rawUrl = location.revenue_url.endsWith("/")
    ? location.revenue_url
    : location.revenue_url + "/";
  const url = new URL(rawUrl);
  const basePath = url.pathname;
  const origin = url.origin;

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const log: unknown[] = [];

  // Use a single undici Client = single TCP connection = same IP for all requests
  const client = new Client(origin, { keepAliveTimeout: 30000 });

  try {
    // Step 1: GET login page
    const loginRes = await client.request({
      path: basePath,
      method: "GET",
      headers: { "User-Agent": UA },
    });

    let sessionId = extractSession(loginRes.headers as Record<string, string | string[] | undefined>);
    const loginHtml = await loginRes.body.text();

    // Parse form
    let uField = "", pField = "", sName = "", sValue = "";
    for (const input of [...loginHtml.matchAll(/<input[^>]*>/gi)]) {
      const tag = input[0];
      const t = (tag.match(/type=['"]?(\w+)['"]?/i)?.[1] || "text").toLowerCase();
      const n = tag.match(/name=['"]?([^'">\s]+)['"]?/i)?.[1] || "";
      if (!n) continue;
      if (t === "text") uField = n;
      else if (t === "password") pField = n;
      else if (t === "submit") {
        sName = n;
        sValue = (tag.match(/value=['"]([^'"]*)['"]/i) || tag.match(/value=(\S+)/i))?.[1] || "";
      }
    }

    log.push({
      step: "1_GET_login",
      status: loginRes.statusCode,
      session: sessionId.substring(0, 8),
      usernameField: uField,
      submit: `${sName}=${sValue}`,
      credentials: { username, password_masked: password.substring(0, 4) + "..." },
    });

    // Step 2: POST with multipart
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2, 18);
    let body = "";
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${uField}"\r\n\r\n${username}\r\n`;
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${pField}"\r\n\r\n${password}\r\n`;
    if (sName) body += `--${boundary}\r\nContent-Disposition: form-data; name="${sName}"\r\n\r\n${sValue}\r\n`;
    body += `--${boundary}--\r\n`;

    const bodyBuf = Buffer.from(body, "utf-8");

    const postRes = await client.request({
      path: basePath,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(bodyBuf.length),
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": UA,
        Referer: origin + basePath,
        Origin: origin,
      },
      body: bodyBuf,
    });

    const postSid = extractSession(postRes.headers as Record<string, string | string[] | undefined>);
    if (postSid) sessionId = postSid;
    const postRedirect = (postRes.headers["location"] as string) || "";

    log.push({
      step: "2_POST_login",
      status: postRes.statusCode,
      redirect: postRedirect,
      newSession: postSid ? postSid.substring(0, 8) : "none",
      note: "SAME TCP connection as step 1",
    });

    // Step 3: Follow redirects through SAME connection
    let currentRes = postRes;
    let redirectCount = 0;

    while (
      redirectCount < 10 &&
      (currentRes.statusCode === 301 || currentRes.statusCode === 302 || currentRes.statusCode === 303)
    ) {
      const loc = (currentRes.headers["location"] as string) || "";
      if (!loc) break;
      await currentRes.body.text();

      let nextPath: string;
      if (loc.startsWith("http")) nextPath = new URL(loc).pathname;
      else if (loc.startsWith("/")) nextPath = loc;
      else nextPath = basePath + loc;

      currentRes = await client.request({
        path: nextPath,
        method: "GET",
        headers: {
          Cookie: `PHPSESSID=${sessionId}`,
          "User-Agent": UA,
          Referer: origin + basePath,
        },
      });

      const rSid = extractSession(currentRes.headers as Record<string, string | string[] | undefined>);
      if (rSid) sessionId = rSid;
      redirectCount++;

      log.push({
        step: `3_redirect_${redirectCount}`,
        path: nextPath,
        status: currentRes.statusCode,
        redirect: (currentRes.headers["location"] as string) || "",
        newSession: rSid ? rSid.substring(0, 8) : "same",
      });
    }

    const finalBody = await currentRes.body.text();
    log.push({
      step: "4_after_redirects",
      isLoginPage: finalBody.includes("klogin.css"),
      bodyLength: finalBody.length,
    });

    // Step 5: GET kperiod.php
    const periodRes = await client.request({
      path: basePath + "kperiod.php",
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": UA,
        Referer: origin + basePath,
      },
    });

    const periodHtml = await periodRes.body.text();
    const isLogin = periodHtml.includes("klogin.css");
    const hasTotals = periodHtml.includes("Totals");

    log.push({
      step: "5_GET_kperiod",
      status: periodRes.statusCode,
      isLoginPage: isLogin,
      hasTotals,
      htmlLength: periodHtml.length,
      preview: periodHtml.substring(0, 300),
    });

    let parsed = null;
    if (!isLogin && hasTotals) {
      parsed = parseRevenueResponse(periodHtml);
    }

    // Step 6: GET kpbd.php (the "Period by Date" report form) and dump its
    // structure so the date-range field names can be verified.
    const pbdRes = await client.request({
      path: basePath + "kpbd.php",
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": UA,
        Referer: origin + basePath,
      },
    });
    const pbdHtml = await pbdRes.body.text();
    const pbdForm = pbdHtml.match(/<form[\s\S]*?<\/form>/i)?.[0] ?? "";
    const pbdFields = [
      ...pbdHtml.matchAll(/<(input|select|textarea)[^>]*>/gi),
    ].map((m) => m[0]);

    log.push({
      step: "6_GET_kpbd",
      status: pbdRes.statusCode,
      isLoginPage: pbdHtml.includes("klogin.css"),
      htmlLength: pbdHtml.length,
      formHtml: pbdForm.substring(0, 4000),
      fields: pbdFields.slice(0, 50),
    });

    // Step 7: run a real date-range fetch (first of this month -> yesterday)
    // and dump the result so the per-machine breakdown can be verified.
    let byDateParsed = null;
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const startIso = iso(new Date(now.getFullYear(), now.getMonth(), 1));
      const endIso = iso(yesterday);

      const byDateHtml = await fetchRevenueByDate(
        location.revenue_url,
        startIso,
        endIso
      );
      byDateParsed = parseRevenueResponse(byDateHtml);
      log.push({
        step: "7_by_date",
        range: `${startIso} -> ${endIso}`,
        htmlLength: byDateHtml.length,
        isLoginPage: byDateHtml.includes("klogin.css"),
        machineLineCount: byDateParsed.machine_lines.length,
        machineLines: byDateParsed.machine_lines.slice(0, 5),
        resultHtml: byDateHtml.substring(0, 8000),
      });
    } catch (e) {
      log.push({ step: "7_by_date", error: String(e) });
    }

    return NextResponse.json({
      location: `${location.location_number} - ${location.name}`,
      method: "undici single-connection",
      success: !isLogin && hasTotals,
      parsed,
      byDateParsed,
      log,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), log });
  } finally {
    await client.close();
  }
}
