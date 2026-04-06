/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 * Some URLs are like "https://ksys22.com/ksals20/" and need "kperiod.php" appended.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Get the base URL from a revenue URL (e.g. "https://ksys22.com/ksals20/")
 */
function getBaseUrl(url: string): string {
  if (url.endsWith("kperiod.php")) {
    return url.replace("kperiod.php", "");
  }
  return url.endsWith("/") ? url : url + "/";
}

/**
 * Fetch revenue page from ksys22 using form-based login.
 *
 * ksys22 uses session-based auth:
 * 1. POST to the base URL with username/password form fields
 * 2. Capture the session cookie from the response
 * 3. Use that cookie to GET kperiod.php
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  const baseUrl = getBaseUrl(revenueUrl);
  const periodUrl = normalizeRevenueUrl(revenueUrl);

  // Step 1: GET the login page to discover the username field name and get initial cookie
  const loginPageRes = await fetch(baseUrl, { redirect: "manual" });
  const loginHtml = await loginPageRes.text();

  // Extract the username field name (it's an obfuscated hash that may change per instance)
  const usernameFieldMatch = loginHtml.match(
    /<input[^>]*type=['"]text['"][^>]*name=['"]([^'"]+)['"]/
  );
  const usernameField = usernameFieldMatch ? usernameFieldMatch[1] : "user";

  // Collect cookies from login page
  const loginCookies = extractCookies(loginPageRes.headers);

  // Step 2: POST login form
  const formData = new URLSearchParams();
  formData.append(usernameField, username);
  formData.append("pass", password);
  formData.append("go", "Log in");

  const loginRes = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(loginCookies ? { Cookie: loginCookies } : {}),
    },
    body: formData.toString(),
    redirect: "manual",
  });

  // Collect session cookies from login response
  const sessionCookies = extractCookies(loginRes.headers);
  const allCookies = mergeCookies(loginCookies, sessionCookies);

  // Step 3: Fetch the period page with session cookie
  const periodRes = await fetch(periodUrl, {
    headers: {
      ...(allCookies ? { Cookie: allCookies } : {}),
    },
    redirect: "follow",
  });

  return periodRes.text();
}

function extractCookies(headers: Headers): string {
  const setCookies = headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    // Fallback: try get raw header
    const raw = headers.get("set-cookie");
    if (!raw) return "";
    return raw
      .split(/,(?=\s*\w+=)/)
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  }
  return setCookies.map((c) => c.split(";")[0].trim()).join("; ");
}

function mergeCookies(existing: string, newCookies: string): string {
  if (!existing && !newCookies) return "";
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  return `${existing}; ${newCookies}`;
}
