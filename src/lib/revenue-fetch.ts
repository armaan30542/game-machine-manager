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
 * Build a multipart/form-data body manually for Node.js compatibility.
 */
function buildMultipartBody(fields: Record<string, string>): { body: string; boundary: string } {
  const boundary = "----FormBoundary" + Math.random().toString(36).substring(2);
  let body = "";
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { body, boundary };
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

  // Step 2: POST login using manually constructed multipart/form-data
  const { body, boundary } = buildMultipartBody({
    [usernameField]: username,
    pass: password,
    go: "Log in",
  });

  const loginRes = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Cookie": `PHPSESSID=${sessionId}`,
      "User-Agent": "Mozilla/5.0",
    },
    body,
    redirect: "manual",
  });

  // Update session ID if a new one was set
  const newSessionId = extractSessionId(loginRes.headers.get("set-cookie"));
  if (newSessionId) sessionId = newSessionId;

  const redirectLocation = loginRes.headers.get("location");

  // Check if login succeeded (redirect to kperiod.php or similar, NOT klogout.php)
  if (redirectLocation && !redirectLocation.includes("klogout")) {
    // Follow the redirect
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

  // If redirected to klogout, login failed - try urlencoded as fallback
  if (redirectLocation && redirectLocation.includes("klogout")) {
    // Reset: get a fresh session
    const freshRes = await fetch(baseUrl, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    await freshRes.text();
    sessionId = extractSessionId(freshRes.headers.get("set-cookie")) || sessionId;

    // Re-extract field name
    const freshHtml = await (await fetch(baseUrl, {
      headers: {
        "Cookie": `PHPSESSID=${sessionId}`,
        "User-Agent": "Mozilla/5.0",
      },
    })).text();
    const freshFieldMatch = freshHtml.match(
      /<input[^>]*type=['"]text['"][^>]*name=['"]([^'"]+)['"]/
    );
    const freshField = freshFieldMatch ? freshFieldMatch[1] : usernameField;

    // Try URL-encoded POST
    const urlEncodedBody = `${encodeURIComponent(freshField)}=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}&go=${encodeURIComponent("Log in")}`;

    const loginRes2 = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `PHPSESSID=${sessionId}`,
        "User-Agent": "Mozilla/5.0",
      },
      body: urlEncodedBody,
      redirect: "manual",
    });

    const newId2 = extractSessionId(loginRes2.headers.get("set-cookie"));
    if (newId2) sessionId = newId2;

    const redirect2 = loginRes2.headers.get("location");
    if (redirect2 && !redirect2.includes("klogout")) {
      const rUrl = redirect2.startsWith("http")
        ? redirect2
        : new URL(redirect2, baseUrl).toString();
      await fetch(rUrl, {
        headers: {
          "Cookie": `PHPSESSID=${sessionId}`,
          "User-Agent": "Mozilla/5.0",
        },
      });
    } else {
      throw new Error(
        `Login failed with both multipart and urlencoded. ` +
        `Multipart redirect: ${redirectLocation}. ` +
        `URLEncoded redirect: ${redirect2 || "none"}. ` +
        `Status: ${loginRes2.status}. Session: ${sessionId}. Field: ${freshField}`
      );
    }
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

  if (html.includes("klogin.css")) {
    throw new Error(
      `Session not authenticated after login. Session: ${sessionId}. Field: ${usernameField}`
    );
  }

  return html;
}
