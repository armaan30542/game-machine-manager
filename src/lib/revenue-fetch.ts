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
 * Collect PHPSESSID from a response.
 */
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

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Build manual multipart/form-data body matching browser format exactly.
 */
function buildBrowserMultipart(
  fields: [string, string][],
  boundary: string
): string {
  let body = "";
  for (const [name, value] of fields) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${name}"\r\n`;
    body += `\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return body;
}

/**
 * Fetch revenue page from ksys22.
 * Tries multiple login approaches (multipart, url-encoded, manual multipart).
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  const baseUrl = revenueUrl.endsWith("kperiod.php")
    ? revenueUrl.replace("kperiod.php", "")
    : revenueUrl.endsWith("/")
      ? revenueUrl
      : revenueUrl + "/";

  const origin = new URL(baseUrl).origin;

  // Step 1: GET login page
  const loginPageRes = await fetch(baseUrl, {
    redirect: "manual",
    headers: { "User-Agent": BROWSER_UA },
  });

  let sessionId = getSession(loginPageRes) || "";
  const loginHtml = await loginPageRes.text();
  const { usernameField, passwordField, submitName, submitValue } =
    parseLoginForm(loginHtml);

  if (!usernameField || !passwordField) {
    throw new Error(`Could not find login form fields`);
  }

  // Step 2: Try login with manual multipart (exact browser format)
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2, 18);
  const fields: [string, string][] = [
    [usernameField, username],
    [passwordField, password],
  ];
  if (submitName) fields.push([submitName, submitValue]);

  const multipartBody = buildBrowserMultipart(fields, boundary);

  const loginRes = await fetch(baseUrl, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Cookie: sessionId ? `PHPSESSID=${sessionId}` : "",
      "User-Agent": BROWSER_UA,
      Referer: baseUrl,
      Origin: origin,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    body: multipartBody,
  });

  // Collect session from final response
  const newSid = getSession(loginRes);
  if (newSid) sessionId = newSid;
  await loginRes.text();

  // Step 3: GET kperiod.php
  const periodRes = await fetch(baseUrl + "kperiod.php", {
    headers: {
      Cookie: `PHPSESSID=${sessionId}`,
      "User-Agent": BROWSER_UA,
      Referer: baseUrl,
    },
  });

  const html = await periodRes.text();

  if (html.includes("klogin.css")) {
    throw new Error(
      `Login failed - got login page after redirect chain`
    );
  }

  return html;
}
