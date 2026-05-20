import { Client } from "undici";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/** Resolve a ksys22 revenue URL to { origin, basePath } (location directory). */
function resolveBase(revenueUrl: string): { origin: string; basePath: string } {
  const url = new URL(
    revenueUrl.endsWith(".php")
      ? revenueUrl.replace(/[^/]*\.php$/, "")
      : revenueUrl.endsWith("/")
        ? revenueUrl
        : revenueUrl + "/"
  );
  return { origin: url.origin, basePath: url.pathname };
}

/** Read a PHPSESSID value out of one-or-many Set-Cookie headers. */
function readSessionId(
  setCookies: string | string[] | undefined,
  fallback: string
): string {
  const arr = Array.isArray(setCookies)
    ? setCookies
    : setCookies
      ? [setCookies]
      : [];
  let sessionId = fallback;
  for (const c of arr) {
    const m = c.match(/PHPSESSID=([^;]+)/);
    if (m) sessionId = m[1];
  }
  return sessionId;
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
 * Parse the date-range form on kpbd.php ("Period by Date").
 *
 * The exact field names are not known ahead of time, so this classifies
 * inputs heuristically: hidden inputs are carried through verbatim, the
 * submit button is captured, and text/date inputs are matched to start/end
 * by their name/id (or, failing that, by document order when there are
 * exactly two).
 */
function parseDateRangeForm(html: string): {
  startField: string;
  endField: string;
  hiddenFields: [string, string][];
  submitName: string;
  submitValue: string;
} | null {
  const formMatch = html.match(/<form[\s\S]*?<\/form>/i);
  const form = formMatch ? formMatch[0] : html;
  const inputs = [...form.matchAll(/<input[^>]*>/gi)].map((m) => m[0]);

  const hiddenFields: [string, string][] = [];
  const dateCandidates: { name: string; role: "start" | "end" | "?" }[] = [];
  let submitName = "";
  let submitValue = "";

  for (const tag of inputs) {
    const name = tag.match(/name=['"]?([^'">\s]+)['"]?/i)?.[1];
    if (!name) continue;
    const type = (tag.match(/type=['"]?(\w+)['"]?/i)?.[1] || "text").toLowerCase();
    const value = tag.match(/value=['"]([^'"]*)['"]/i)?.[1] ?? "";
    const idAttr = tag.match(/id=['"]?([^'">\s]+)['"]?/i)?.[1] || "";
    const hint = `${name} ${idAttr}`.toLowerCase();

    if (type === "hidden") {
      hiddenFields.push([name, value]);
    } else if (type === "submit") {
      submitName = name;
      submitValue = value;
    } else if (type === "date" || type === "text") {
      let role: "start" | "end" | "?" = "?";
      if (/start|from|begin|date1|sdate/.test(hint)) role = "start";
      else if (/end|thru|date2|edate|\bto\b/.test(hint)) role = "end";
      dateCandidates.push({ name, role });
    }
  }

  let start = dateCandidates.find((c) => c.role === "start")?.name;
  let end = dateCandidates.find((c) => c.role === "end")?.name;
  if ((!start || !end) && dateCandidates.length === 2) {
    start = start ?? dateCandidates[0].name;
    end = end ?? dateCandidates[1].name;
  }
  if (!start || !end) return null;

  return { startField: start, endField: end, hiddenFields, submitName, submitValue };
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
 * Log into ksys22 over the given undici Client and return the live PHPSESSID.
 *
 * All requests share one TCP connection (the caller's Client) so the source
 * IP stays constant - ksys22 validates sessions against the client IP.
 */
async function establishSession(
  client: Client,
  basePath: string,
  origin: string
): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;
  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  // Step 1: GET login page
  const loginRes = await client.request({
    path: basePath,
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  let sessionId = readSessionId(loginRes.headers["set-cookie"], "");
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
      "User-Agent": USER_AGENT,
      Referer: origin + basePath,
      Origin: origin,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    body,
  });

  sessionId = readSessionId(postRes.headers["set-cookie"], sessionId);

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
    await currentRes.body.text();

    let nextPath: string;
    if (location.startsWith("http")) nextPath = new URL(location).pathname;
    else if (location.startsWith("/")) nextPath = location;
    else nextPath = basePath + location;

    currentRes = await client.request({
      path: nextPath,
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": USER_AGENT,
        Referer: origin + basePath,
      },
    });
    sessionId = readSessionId(currentRes.headers["set-cookie"], sessionId);
    redirectCount++;
  }
  await currentRes.body.text();

  return sessionId;
}

/**
 * Fetch the current-period revenue page (kperiod.php) from ksys22.
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const { origin, basePath } = resolveBase(revenueUrl);
  const client = new Client(origin, { keepAliveTimeout: 30000 });

  try {
    const sessionId = await establishSession(client, basePath, origin);

    const periodRes = await client.request({
      path: basePath + "kperiod.php",
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": USER_AGENT,
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

/**
 * Fetch a custom date-range revenue report (kpbd.php "Period by Date").
 *
 * @param startDate - "YYYY-MM-DD"
 * @param endDate   - "YYYY-MM-DD"
 */
export async function fetchRevenueByDate(
  revenueUrl: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const { origin, basePath } = resolveBase(revenueUrl);
  const client = new Client(origin, { keepAliveTimeout: 30000 });

  const toMdy = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  };

  try {
    let sessionId = await establishSession(client, basePath, origin);

    // GET the date-range form page
    const formRes = await client.request({
      path: basePath + "kpbd.php",
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": USER_AGENT,
        Referer: origin + basePath,
      },
    });
    const formHtml = await formRes.body.text();
    if (formHtml.includes("klogin.css")) {
      throw new Error("Session expired before reaching kpbd.php");
    }

    const form = parseDateRangeForm(formHtml);
    if (!form) {
      throw new Error("Could not parse the date-range form on kpbd.php");
    }

    // POST the date range
    const boundary =
      "----WebKitFormBoundary" + Math.random().toString(36).slice(2, 18);
    const fields: [string, string][] = [
      ...form.hiddenFields,
      [form.startField, toMdy(startDate)],
      [form.endField, toMdy(endDate)],
    ];
    if (form.submitName) fields.push([form.submitName, form.submitValue]);
    const body = buildMultipart(fields, boundary);

    let res = await client.request({
      path: basePath + "kpbd.php",
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
        Cookie: `PHPSESSID=${sessionId}`,
        "User-Agent": USER_AGENT,
        Referer: origin + basePath + "kpbd.php",
        Origin: origin,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      body,
    });
    sessionId = readSessionId(res.headers["set-cookie"], sessionId);

    let redirectCount = 0;
    while (
      redirectCount < 10 &&
      (res.statusCode === 301 ||
        res.statusCode === 302 ||
        res.statusCode === 303)
    ) {
      const location = res.headers["location"] as string | undefined;
      if (!location) break;
      await res.body.text();

      let nextPath: string;
      if (location.startsWith("http")) nextPath = new URL(location).pathname;
      else if (location.startsWith("/")) nextPath = location;
      else nextPath = basePath + location;

      res = await client.request({
        path: nextPath,
        method: "GET",
        headers: {
          Cookie: `PHPSESSID=${sessionId}`,
          "User-Agent": USER_AGENT,
          Referer: origin + basePath + "kpbd.php",
        },
      });
      sessionId = readSessionId(res.headers["set-cookie"], sessionId);
      redirectCount++;
    }

    const html = await res.body.text();
    if (html.includes("klogin.css")) {
      throw new Error("Login failed - got login page instead of report data");
    }
    return html;
  } finally {
    await client.close();
  }
}
