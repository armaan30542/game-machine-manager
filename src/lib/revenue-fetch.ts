/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Get the base URL from a revenue URL
 */
function getBaseUrl(url: string): string {
  if (url.endsWith("kperiod.php")) {
    return url.replace("kperiod.php", "");
  }
  return url.endsWith("/") ? url : url + "/";
}

function extractSessionId(setCookieHeader: string | null): string {
  if (!setCookieHeader) return "";
  const match = setCookieHeader.match(/PHPSESSID=([^;,\s]+)/);
  return match ? match[1] : "";
}

/**
 * Fetch revenue page from ksys22 using form-based login.
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  const baseUrl = getBaseUrl(revenueUrl);
  const periodUrl = normalizeRevenueUrl(revenueUrl);

  // Step 1: GET login page for PHPSESSID and username field name
  const loginPageRes = await fetch(baseUrl, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const loginHtml = await loginPageRes.text();

  let sessionId = extractSessionId(loginPageRes.headers.get("set-cookie"));

  // Extract username field name (obfuscated)
  const fieldMatch = loginHtml.match(
    /<input[^>]*type=['"]text['"][^>]*name=['"]([^'"]+)['"]/
  );
  const usernameField = fieldMatch ? fieldMatch[1] : "user";

  // Step 2: POST login using multipart/form-data (required by the form)
  const formData = new FormData();
  formData.append(usernameField, username);
  formData.append("pass", password);
  formData.append("go", "Log in");

  const loginRes = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Cookie": `PHPSESSID=${sessionId}`,
      "User-Agent": "Mozilla/5.0",
    },
    body: formData,
    redirect: "manual",
  });

  // Update session ID if a new one was set
  const newSessionId = extractSessionId(loginRes.headers.get("set-cookie"));
  if (newSessionId) sessionId = newSessionId;

  // If login returned a redirect, follow it to establish the session
  const redirectLocation = loginRes.headers.get("location");
  if (redirectLocation) {
    const redirectUrl = redirectLocation.startsWith("http")
      ? redirectLocation
      : new URL(redirectLocation, baseUrl).toString();

    const redirectRes = await fetch(redirectUrl, {
      headers: {
        "Cookie": `PHPSESSID=${sessionId}`,
        "User-Agent": "Mozilla/5.0",
      },
      redirect: "manual",
    });

    const redirectSessionId = extractSessionId(redirectRes.headers.get("set-cookie"));
    if (redirectSessionId) sessionId = redirectSessionId;
  }

  // Step 3: Fetch the period page with authenticated session
  const periodRes = await fetch(periodUrl, {
    headers: {
      "Cookie": `PHPSESSID=${sessionId}`,
      "User-Agent": "Mozilla/5.0",
    },
    redirect: "follow",
  });

  const html = await periodRes.text();

  // Verify we got data, not the login page
  if (html.includes("klogin.css")) {
    throw new Error(
      `Login failed. Status: ${loginRes.status}. ` +
      `Redirect: ${redirectLocation || "none"}. ` +
      `Session: ${sessionId}. ` +
      `Field: ${usernameField}`
    );
  }

  return html;
}
