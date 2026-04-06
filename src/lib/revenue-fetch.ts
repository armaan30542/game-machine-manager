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
      const vm = tag.match(/value=['"]([^'"]*)['"]/i) || tag.match(/value=(\S+)/i);
      submitValue = vm?.[1] || "";
    }
  }

  return { usernameField, passwordField, submitName, submitValue };
}

/**
 * Collect all PHPSESSID cookies from a response.
 */
function getSessionFromResponse(res: Response): string {
  const cookies: string[] = [];
  if (res.headers.getSetCookie) {
    cookies.push(...res.headers.getSetCookie());
  }
  res.headers.forEach((v, k) => {
    if (k.toLowerCase() === "set-cookie" && !cookies.includes(v)) {
      cookies.push(v);
    }
  });
  for (const c of cookies) {
    const m = c.match(/PHPSESSID=([^;]+)/);
    if (m) return m[1];
  }
  return "";
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/**
 * Follow a redirect chain manually, collecting session cookies at each step.
 * Returns the final session ID and the final response body.
 */
async function followRedirects(
  initialRes: Response,
  initialSessionId: string,
  baseUrl: string,
  maxRedirects = 10
): Promise<{ sessionId: string; finalBody: string; finalUrl: string }> {
  let sessionId = initialSessionId;
  let res = initialRes;
  let redirectCount = 0;

  // Collect session from initial response
  const newSid = getSessionFromResponse(res);
  if (newSid) sessionId = newSid;

  while (
    redirectCount < maxRedirects &&
    (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307)
  ) {
    const location = res.headers.get("location");
    if (!location) break;

    // Consume current response body
    await res.text();

    // Resolve relative URLs
    const nextUrl = location.startsWith("http")
      ? location
      : new URL(location, baseUrl).toString();

    // Follow redirect as GET with cookies
    res = await fetch(nextUrl, {
      redirect: "manual",
      headers: {
        ...BROWSER_HEADERS,
        Cookie: `PHPSESSID=${sessionId}`,
        Referer: baseUrl,
      },
    });

    const redirectSid = getSessionFromResponse(res);
    if (redirectSid) sessionId = redirectSid;
    redirectCount++;
  }

  const finalBody = await res.text();
  return { sessionId, finalBody, finalUrl: res.url || baseUrl };
}

/**
 * Fetch revenue page from ksys22.
 * 1. GET login page → session cookie + form field names
 * 2. POST login → follow ALL redirects (including klogout) collecting cookies
 * 3. GET kperiod.php with final session cookie
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

  // Step 1: GET login page
  const loginPageRes = await fetch(baseUrl, {
    redirect: "manual",
    headers: BROWSER_HEADERS,
  });

  let sessionId = getSessionFromResponse(loginPageRes) || "";
  const loginHtml = await loginPageRes.text();
  const { usernameField, passwordField, submitName, submitValue } =
    parseLoginForm(loginHtml);

  if (!usernameField || !passwordField) {
    throw new Error(
      `Could not find login form fields in HTML (length=${loginHtml.length})`
    );
  }

  // Step 2: POST login with FormData
  const formData = new FormData();
  formData.append(usernameField, username);
  formData.append(passwordField, password);
  if (submitName) formData.append(submitName, submitValue);

  const loginRes = await fetch(baseUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      ...BROWSER_HEADERS,
      Cookie: sessionId ? `PHPSESSID=${sessionId}` : "",
      Referer: baseUrl,
      Origin: new URL(baseUrl).origin,
    },
    body: formData,
  });

  // Follow ALL redirects (klogout, kmain, etc.) - collect cookies at each step
  const result = await followRedirects(loginRes, sessionId, baseUrl);
  sessionId = result.sessionId;

  // Step 3: GET kperiod.php with the final session
  const periodRes = await fetch(baseUrl + "kperiod.php", {
    redirect: "manual",
    headers: {
      ...BROWSER_HEADERS,
      Cookie: `PHPSESSID=${sessionId}`,
      Referer: baseUrl,
    },
  });

  const periodResult = await followRedirects(periodRes, sessionId, baseUrl);
  sessionId = periodResult.sessionId;
  const html = periodResult.finalBody;

  if (html.includes("klogin.css")) {
    throw new Error(
      `Login failed - got login page after redirect chain. Final URL: ${periodResult.finalUrl}`
    );
  }

  return html;
}
