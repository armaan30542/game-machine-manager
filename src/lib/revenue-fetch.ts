import { Client } from "undici";

/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Parse login form fields from ksys22 HTML.
 */
function parseLoginForm(html: string) {
  const inputs = [...html.matchAll(/<input[^>]*>/gi)];
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
      const vm =
        tag.match(/value=['"]([^'"]*)['"]/i) || tag.match(/value=(\S+)/i);
      submitValue = vm?.[1] || "";
    }
  }

  return { usernameField, passwordField, submitName, submitValue };
}

/**
 * Build multipart/form-data body matching exact browser format.
 */
function buildMultipart(
  fields: [string, string][],
  boundary: string
): Buffer {
  let body = "";
  for (const [name, value] of fields) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${name}"\r\n`;
    body += `\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return Buffer.from(body, "utf-8");
}

/**
 * Fetch revenue page from ksys22 using undici Client.
 *
 * Uses a single TCP connection for ALL requests (GET login, POST login,
 * follow redirects, GET kperiod). This ensures the same source IP for
 * every request, which is critical because ksys22 likely validates
 * sessions against the client IP.
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  const url = new URL(
    revenueUrl.endsWith("kperiod.php")
      ? revenueUrl.replace("kperiod.php", "")
      : revenueUrl.endsWith("/")
        ? revenueUrl
        : revenueUrl + "/"
  );

  const basePath = url.pathname;
  const origin = url.origin;

  // Single connection client - all requests go through same TCP connection
  const client = new Client(origin, { keepAliveTimeout: 30000 });

  try {
    // Step 1: GET login page
    const loginRes = await client.request({
      path: basePath,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // Extract session cookie
    let sessionId = "";
    const setCookies = loginRes.headers["set-cookie"];
    const cookieArray = Array.isArray(setCookies)
      ? setCookies
      : setCookies
        ? [setCookies]
        : [];
    for (const c of cookieArray) {
      const m = c.match(/PHPSESSID=([^;]+)/);
      if (m) sessionId = m[1];
    }

    const loginHtml = await loginRes.body.text();
    const { usernameField, passwordField, submitName, submitValue } =
      parseLoginForm(loginHtml);

    if (!usernameField || !passwordField) {
      throw new Error("Could not find login form fields");
    }

    // Step 2: POST login with multipart/form-data
    const boundary =
      "----WebKitFormBoundary" + Math.random().toString(36).slice(2, 18);
    const fields: [string, string][] = [
      [usernameField, username],
      [passwordField, password],
    ];
    if (submitName) fields.push([submitName, submitValue]);

    const body = buildMultipart(fields, boundary);

    const postRes = await client.request({
      path: basePath,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: origin + basePath,
        Origin: origin,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      body,
    });

    // Collect new session if set
    const postCookies = postRes.headers["set-cookie"];
    const postCookieArr = Array.isArray(postCookies)
      ? postCookies
      : postCookies
        ? [postCookies]
        : [];
    for (const c of postCookieArr) {
      const m = c.match(/PHPSESSID=([^;]+)/);
      if (m) sessionId = m[1];
    }

    // Follow redirects manually through the SAME connection
    let currentRes = postRes;
    let redirectCount = 0;

    while (
      redirectCount < 10 &&
      (currentRes.statusCode === 301 ||
        currentRes.statusCode === 302 ||
        currentRes.statusCode === 303)
    ) {
      const location = currentRes.headers["location"] as string | undefined;
      if (!location) break;

      // Consume current body
      await currentRes.body.text();

      // Resolve path
      let nextPath: string;
      if (location.startsWith("http")) {
        nextPath = new URL(location).pathname;
      } else if (location.startsWith("/")) {
        nextPath = location;
      } else {
        nextPath = basePath + location;
      }

      currentRes = await client.request({
        path: nextPath,
        method: "GET",
        headers: {
          Cookie: `PHPSESSID=${sessionId}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: origin + basePath,
        },
      });

      // Collect cookies from each redirect
      const rCookies = currentRes.headers["set-cookie"];
      const rCookieArr = Array.isArray(rCookies)
        ? rCookies
        : rCookies
          ? [rCookies]
          : [];
      for (const c of rCookieArr) {
        const m = c.match(/PHPSESSID=([^;]+)/);
        if (m) sessionId = m[1];
      }

      redirectCount++;
    }

    await currentRes.body.text();

    // Step 3: GET kperiod.php
    const periodRes = await client.request({
      path: basePath + "kperiod.php",
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: origin + basePath,
      },
    });

    const html = await periodRes.body.text();

    if (html.includes("klogin.css")) {
      throw new Error("Login failed - got login page instead of revenue data");
    }

    return html;
  } finally {
    await client.close();
  }
}
