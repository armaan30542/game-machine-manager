/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Extract form field names and submit button from ksys22 login page HTML.
 */
function parseLoginForm(html: string): {
  usernameField: string;
  passwordField: string;
  submitName: string;
  submitValue: string;
  hiddenFields: Record<string, string>;
} {
  const inputs = [...html.matchAll(/<input[^>]*>/gi)];

  let usernameField = "";
  let passwordField = "";
  let submitName = "";
  let submitValue = "";
  const hiddenFields: Record<string, string> = {};

  for (const input of inputs) {
    const tag = input[0];
    const typeMatch = tag.match(/type=['"]?(\w+)['"]?/i);
    const nameMatch = tag.match(/name=['"]?([^'">\s]+)['"]?/i);

    if (!nameMatch) continue;
    const name = nameMatch[1];
    const type = (typeMatch?.[1] || "text").toLowerCase();

    if (type === "text") {
      usernameField = name;
    } else if (type === "password") {
      passwordField = name;
    } else if (type === "submit") {
      submitName = name;
      // value can contain spaces like "Log in", so match within quotes
      const valueMatch = tag.match(/value=['"]([^'"]*)['"]/i) ||
        tag.match(/value=(\S+)/i);
      submitValue = valueMatch?.[1] || "";
    } else if (type === "hidden") {
      const valueMatch = tag.match(/value=['"]?([^'">\s]*)['"]?/i);
      hiddenFields[name] = valueMatch?.[1] || "";
    }
  }

  return { usernameField, passwordField, submitName, submitValue, hiddenFields };
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
 * Fetch revenue page from ksys22 using native fetch with form-based login.
 * 1. GET login page → extract PHPSESSID cookie + form field names
 * 2. POST login with native FormData (includes submit button field)
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

  // Step 1: GET login page
  const loginPageRes = await fetch(baseUrl, {
    redirect: "manual",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  let sessionId = extractSessionCookie(loginPageRes);
  const loginHtml = await loginPageRes.text();

  const { usernameField, passwordField, submitName, submitValue, hiddenFields } =
    parseLoginForm(loginHtml);

  if (!usernameField || !passwordField) {
    throw new Error(
      `Could not find login form fields. Username: "${usernameField}", Password: "${passwordField}"`
    );
  }

  // Step 2: POST login using native FormData
  // This ensures correct multipart/form-data encoding
  const formData = new FormData();

  // Add hidden fields first
  for (const [key, value] of Object.entries(hiddenFields)) {
    formData.append(key, value);
  }

  // Add credentials
  formData.append(usernameField, username);
  formData.append(passwordField, password);

  // Add submit button - PHP checks for this to know form was submitted
  if (submitName) {
    formData.append(submitName, submitValue);
  }

  const loginRes = await fetch(baseUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: sessionId ? `PHPSESSID=${sessionId}` : "",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: baseUrl,
    },
    body: formData,
    // Don't set Content-Type - fetch sets it automatically with correct boundary
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
