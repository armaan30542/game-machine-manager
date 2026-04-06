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

  const username = process.env.REVENUE_API_USERNAME || "";
  const password = process.env.REVENUE_API_PASSWORD || "";
  const baseUrl = location.revenue_url.endsWith("/")
    ? location.revenue_url
    : location.revenue_url + "/";

  const results: Record<string, unknown> = {
    location: `${location.location_number} - ${location.name}`,
    revenue_url: location.revenue_url,
    env_check: {
      username_length: username.length,
      username_first2: username.substring(0, 2),
      password_length: password.length,
      password_first2: password.substring(0, 2),
    },
  };

  try {
    // Step 1: GET login page
    const loginPageRes = await fetch(baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    let sessionId = "";
    if (loginPageRes.headers.getSetCookie) {
      for (const c of loginPageRes.headers.getSetCookie()) {
        const m = c.match(/PHPSESSID=([^;]+)/);
        if (m) sessionId = m[1];
      }
    }

    const loginHtml = await loginPageRes.text();

    // Parse form
    const inputs = [...loginHtml.matchAll(/<input[^>]*>/gi)];
    let usernameField = "";
    let passwordField = "";
    let submitName = "";
    let submitValue = "";

    for (const input of inputs) {
      const tag = input[0];
      const typeMatch = tag.match(/type=['"]?(\w+)['"]?/i);
      const nameMatch = tag.match(/name=['"]?([^'">\s]+)['"]?/i);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      const type = (typeMatch?.[1] || "text").toLowerCase();

      if (type === "text") usernameField = name;
      else if (type === "password") passwordField = name;
      else if (type === "submit") {
        submitName = name;
        const valMatch =
          tag.match(/value=['"]([^'"]*)['"]/i) || tag.match(/value=(\S+)/i);
        submitValue = valMatch?.[1] || "";
      }
    }

    results.step1 = {
      status: loginPageRes.status,
      sessionId: sessionId.substring(0, 10) + "...",
      usernameField,
      passwordField,
      submitField: `${submitName}=${submitValue}`,
    };

    // Try login with BOTH base URL and index.php to compare
    async function tryLogin(postUrl: string, label: string) {
      const formData = new FormData();
      formData.append(usernameField, username);
      formData.append(passwordField, password);
      if (submitName) formData.append(submitName, submitValue);

      const res = await fetch(postUrl, {
        method: "POST",
        redirect: "manual",
        headers: {
          Cookie: `PHPSESSID=${sessionId}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: baseUrl,
          Origin: new URL(baseUrl).origin,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        body: formData,
      });

      let newSessionId = "";
      if (res.headers.getSetCookie) {
        for (const c of res.headers.getSetCookie()) {
          const m = c.match(/PHPSESSID=([^;]+)/);
          if (m) newSessionId = m[1];
        }
      }

      const redirect = res.headers.get("location") || "";
      const body = await res.text();

      return {
        label,
        postUrl,
        status: res.status,
        redirect,
        newSession: newSessionId
          ? newSessionId.substring(0, 10) + "..."
          : "same",
        isLoginPage: body.includes("klogin.css"),
        hasTotals: body.includes("Totals"),
        bodyLength: body.length,
        bodyPreview: body.substring(0, 300),
      };
    }

    const [resultBaseUrl, resultIndexPhp] = await Promise.all([
      tryLogin(baseUrl, "POST to baseUrl"),
      tryLogin(baseUrl + "index.php", "POST to index.php"),
    ]);

    results.step2_baseUrl = resultBaseUrl;
    results.step2_indexPhp = resultIndexPhp;

    // Step 3: If either login succeeded, try period page
    const successLogin = !resultBaseUrl.isLoginPage
      ? resultBaseUrl
      : !resultIndexPhp.isLoginPage
        ? resultIndexPhp
        : null;

    if (successLogin) {
      const sid =
        successLogin === resultBaseUrl
          ? (resultBaseUrl.newSession !== "same"
              ? resultBaseUrl.newSession
              : sessionId)
          : (resultIndexPhp.newSession !== "same"
              ? resultIndexPhp.newSession
              : sessionId);

      const periodRes = await fetch(baseUrl + "kperiod.php", {
        headers: {
          Cookie: `PHPSESSID=${sid}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html = await periodRes.text();
      results.step3 = {
        status: periodRes.status,
        isLoginPage: html.includes("klogin.css"),
        hasTotals: html.includes("Totals"),
        htmlLength: html.length,
      };
      if (html.includes("Totals")) {
        results.parsed = parseRevenueResponse(html);
      }
    } else {
      results.step3 = "skipped - both logins failed";
    }

    return NextResponse.json(results);
  } catch (err) {
    results.error = String(err);
    return NextResponse.json(results);
  }
}
