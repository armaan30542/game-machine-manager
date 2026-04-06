import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const origin = new URL(baseUrl).origin;

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const results: Record<string, unknown> = {
    location: `${location.location_number} - ${location.name}`,
    env: {
      username_value: username,
      password_value: password.substring(0, 3) + "***" + password.substring(password.length - 2),
      password_length: password.length,
    },
  };

  try {
    // GET login page
    const loginRes = await fetch(baseUrl, { redirect: "manual", headers: { "User-Agent": UA } });
    const sessionId = getSession(loginRes) || "";
    const loginHtml = await loginRes.text();

    // Parse form
    const inputs = [...loginHtml.matchAll(/<input[^>]*>/gi)];
    let uField = "", pField = "", sName = "", sValue = "";
    for (const input of inputs) {
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

    results.form = { usernameField: uField, passwordField: pField, submit: `${sName}=${sValue}`, session: sessionId.substring(0, 8) };

    // Try 3 different POST methods
    async function tryMethod(label: string, contentType: string, body: string) {
      // Get a fresh session for each attempt
      const freshRes = await fetch(baseUrl, { redirect: "manual", headers: { "User-Agent": UA } });
      const freshSid = getSession(freshRes) || "";
      await freshRes.text();

      const freshHtml = await (await fetch(baseUrl, { headers: { "User-Agent": UA } })).text();
      // Re-parse for fresh field name (it changes per session!)
      let freshUField = "";
      for (const input of [...freshHtml.matchAll(/<input[^>]*>/gi)]) {
        const tag = input[0];
        const t = (tag.match(/type=['"]?(\w+)['"]?/i)?.[1] || "text").toLowerCase();
        const n = tag.match(/name=['"]?([^'">\s]+)['"]?/i)?.[1] || "";
        if (t === "text") { freshUField = n; break; }
      }

      // Rebuild body with fresh field name
      let actualBody = body;
      if (freshUField && freshUField !== uField) {
        actualBody = body.replace(uField, freshUField);
      }

      const res = await fetch(baseUrl, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": contentType,
          Cookie: `PHPSESSID=${freshSid}`,
          "User-Agent": UA,
          Referer: baseUrl,
          Origin: origin,
        },
        body: actualBody,
      });

      const redirect = res.headers.get("location") || "";
      const newSid = getSession(res);
      const resBody = await res.text();

      return {
        label,
        freshSession: freshSid.substring(0, 8),
        freshUsernameField: freshUField || uField,
        status: res.status,
        redirect,
        newSession: newSid ? newSid.substring(0, 8) : "none",
        isLoginPage: resBody.includes("klogin.css"),
        bodyPreview: resBody.substring(0, 200),
      };
    }

    // Method 1: URL-encoded
    const urlEncoded = `${encodeURIComponent(uField)}=${encodeURIComponent(username)}&${encodeURIComponent(pField)}=${encodeURIComponent(password)}&${encodeURIComponent(sName)}=${encodeURIComponent(sValue)}`;

    // Method 2: Manual multipart (browser-like)
    const boundary = "----WebKitFormBoundaryABC123";
    let multipart = "";
    multipart += `--${boundary}\r\nContent-Disposition: form-data; name="${uField}"\r\n\r\n${username}\r\n`;
    multipart += `--${boundary}\r\nContent-Disposition: form-data; name="${pField}"\r\n\r\n${password}\r\n`;
    multipart += `--${boundary}\r\nContent-Disposition: form-data; name="${sName}"\r\n\r\n${sValue}\r\n`;
    multipart += `--${boundary}--\r\n`;

    // Method 3: URL-encoded WITHOUT submit button
    const urlEncodedNoSubmit = `${encodeURIComponent(uField)}=${encodeURIComponent(username)}&${encodeURIComponent(pField)}=${encodeURIComponent(password)}`;

    const [r1, r2, r3] = await Promise.all([
      tryMethod("url-encoded", "application/x-www-form-urlencoded", urlEncoded),
      tryMethod("multipart", `multipart/form-data; boundary=${boundary}`, multipart),
      tryMethod("url-encoded-no-submit", "application/x-www-form-urlencoded", urlEncodedNoSubmit),
    ]);

    results.method1_urlencoded = r1;
    results.method2_multipart = r2;
    results.method3_urlencoded_no_submit = r3;

    return NextResponse.json(results);
  } catch (err) {
    results.error = String(err);
    return NextResponse.json(results);
  }
}
