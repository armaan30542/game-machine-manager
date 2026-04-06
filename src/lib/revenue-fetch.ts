/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Extract form field names from ksys22 login page HTML.
 * The username field has an obfuscated name (hash), so we parse the HTML
 * to find the actual input names.
 */
function parseLoginForm(html: string): {
  usernameField: string;
  passwordField: string;
  hiddenFields: Record<string, string>;
  action: string;
} {
  // Find all input fields in the form
  const inputs = [...html.matchAll(/<input[^>]*>/gi)];

  let usernameField = "";
  let passwordField = "";
  const hiddenFields: Record<string, string> = {};

  for (const input of inputs) {
    const tag = input[0];
    const typeMatch = tag.match(/type=['"]?(\w+)['"]?/i);
    const nameMatch = tag.match(/name=['"]?([^'">\s]+)['"]?/i);

    if (!nameMatch) continue;
    const name = nameMatch[1];
    const type = (typeMatch?.[1] || "text").toLowerCase();

    if (type === "text") usernameField = name;
    else if (type === "password") passwordField = name;
    else if (type === "hidden") {
      const valueMatch = tag.match(/value=['"]?([^'">\s]*)['"]?/i);
      hiddenFields[name] = valueMatch?.[1] || "";
    }
  }

  // Find form action
  const actionMatch = html.match(/<form[^>]*action=['"]?([^'">\s]*)['"]?/i);
  const action = actionMatch?.[1] || "";

  return { usernameField, passwordField, hiddenFields, action };
}

/**
 * Extract PHPSESSID from Set-Cookie headers.
 */
function extractSessionCookie(response: Response): string {
  const cookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(value);
    }
  });

  // Also check getSetCookie if available
  if (response.headers.getSetCookie) {
    cookies.push(...response.headers.getSetCookie());
  }

  for (const cookie of cookies) {
    const match = cookie.match(/PHPSESSID=([^;]+)/);
    if (match) return match[1];
  }
  return "";
}

/**
 * Build a multipart/form-data body manually.
 */
function buildMultipartBody(
  fields: Record<string, string>,
  boundary: string
): string {
  let body = "";
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return body;
}

/**
 * Fetch revenue page from ksys22 using native fetch with form-based login.
 * Steps:
 * 1. GET login page → extract PHPSESSID cookie + form field names
 * 2. POST login with multipart/form-data using extracted field names
 * 3. GET kperiod.php with session cookie
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

  // Step 1: GET login page to get session cookie and form field names
  const loginPageRes = await fetch(baseUrl, {
    redirect: "manual",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  let sessionId = extractSessionCookie(loginPageRes);
  const loginHtml = await loginPageRes.text();

  const { usernameField, passwordField, hiddenFields } =
    parseLoginForm(loginHtml);

  if (!usernameField || !passwordField) {
    throw new Error(
      `Could not find login form fields. Username field: "${usernameField}", Password field: "${passwordField}"`
    );
  }

  // Step 2: POST login with multipart/form-data
  // Include any hidden fields from the form (CSRF tokens, etc.)
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const formFields: Record<string, string> = {
    ...hiddenFields,
    [usernameField]: username,
    [passwordField]: password,
  };

  const body = buildMultipartBody(formFields, boundary);

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

  // Update session cookie if a new one was set
  const newSession = extractSessionCookie(loginRes);
  if (newSession) sessionId = newSession;

  // Check redirect location
  const redirectUrl = loginRes.headers.get("location") || "";
  if (redirectUrl.includes("klogout")) {
    throw new Error("Login failed - redirected to logout page");
  }

  // Consume the login response body
  await loginRes.text();

  // Step 3: GET the period page with session cookie
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

  if (html.includes("klogin.css")) {
    throw new Error(
      "Login failed - session not valid, got login page instead of revenue data"
    );
  }

  return html;
}
