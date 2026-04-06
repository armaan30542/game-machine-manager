/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

function getBaseUrl(url: string): string {
  if (url.endsWith("kperiod.php")) {
    return url.replace("kperiod.php", "");
  }
  return url.endsWith("/") ? url : url + "/";
}

function extractAllCookies(headers: Headers): string {
  // Get all set-cookie headers and combine into a cookie string
  const raw = headers.get("set-cookie");
  if (!raw) return "";
  // set-cookie can have multiple values separated by commas, but cookie values
  // can also contain commas in expires. Split on PHPSESSID to be safe.
  const cookies: string[] = [];
  const matches = raw.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=([^;,\s]*)/g);
  for (const m of matches) {
    cookies.push(`${m[1]}=${m[2]}`);
  }
  return cookies.join("; ");
}

/**
 * Fetch revenue page from ksys22 using form-based login.
 *
 * The login form uses multipart/form-data with an obfuscated username field.
 * We need to: GET login page -> extract field name + cookies -> POST form -> follow redirect -> fetch period page
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  const baseUrl = getBaseUrl(revenueUrl);
  const periodUrl = normalizeRevenueUrl(revenueUrl);
  const indexUrl = baseUrl + "index.php";

  // Step 1: GET the login page
  const loginPageRes = await fetch(indexUrl, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const loginHtml = await loginPageRes.text();
  const loginCookies = extractAllCookies(loginPageRes.headers);

  // Extract username field name
  const fieldMatch = loginHtml.match(
    /<input[^>]*type=['"]text['"][^>]*name=['"]([^'"]+)['"]/
  );
  const usernameField = fieldMatch ? fieldMatch[1] : "user";

  // Step 2: POST login form
  // Try with native FormData (Web API available in Node 18+)
  const formData = new FormData();
  formData.append(usernameField, username);
  formData.append("pass", password);
  formData.append("go", "Log in");

  const loginRes = await fetch(indexUrl, {
    method: "POST",
    headers: {
      ...(loginCookies ? { "Cookie": loginCookies } : {}),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: formData,
    redirect: "manual",
  });

  // Collect all cookies from login response
  const loginResCookies = extractAllCookies(loginRes.headers);
  const allCookies = loginResCookies || loginCookies;

  const redirectLocation = loginRes.headers.get("location");
  const loginStatus = loginRes.status;

  // If we got a redirect, follow it
  if (redirectLocation && !redirectLocation.includes("klogout")) {
    const redirectUrl = redirectLocation.startsWith("http")
      ? redirectLocation
      : new URL(redirectLocation, baseUrl).toString();

    const followRes = await fetch(redirectUrl, {
      headers: {
        "Cookie": allCookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
    });
    // Consume
    await followRes.text();
  }

  // Step 3: Fetch the period page
  const periodRes = await fetch(periodUrl, {
    headers: {
      "Cookie": allCookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    redirect: "follow",
  });
  const html = await periodRes.text();

  // If still on login page, report detailed error
  if (html.includes("klogin.css")) {
    throw new Error(
      `Login failed. POST to: ${indexUrl}. ` +
      `Status: ${loginStatus}. ` +
      `Redirect: ${redirectLocation || "none"}. ` +
      `Cookies sent: ${loginCookies.substring(0, 80)}. ` +
      `Cookies received: ${loginResCookies.substring(0, 80)}. ` +
      `Field: ${usernameField}. ` +
      `Login page URL: ${loginPageRes.url}`
    );
  }

  return html;
}
