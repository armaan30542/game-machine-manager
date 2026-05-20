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

/** Read an attribute value from a single HTML tag string. */
function tagAttr(tag: string, name: string): string | undefined {
  const m = tag.match(
    new RegExp(
      `[\\s'"]${name}\\s*=\\s*('([^']*)'|"([^"]*)"|([^\\s'">]+))`,
      "i"
    )
  );
  if (!m) return undefined;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

/** Rank an AM/PM time label on a 0-23 scale (00AM=0, 12PM=12, 11PM=23). */
function timeRank(label: string): number | null {
  const m = label.match(/(\d{1,2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[2])) h += 12;
  return h;
}

/**
 * Parse the date-range form on kpbd.php ("Period on ... Games").
 *
 * The form has two date text inputs (From / To), two AM-PM time dropdowns
 * and a Search button. This reads it generically:
 *   - the two text inputs, in document order, are the start and end dates;
 *   - AM/PM <select> menus become the start time (earliest option) and end
 *     time (latest option) so a range covers whole days;
 *   - other selects keep their current value, hidden inputs pass through,
 *     and only the search-style submit button is included (not "Close").
 */
function parseDateRangeForm(html: string): {
  fixedFields: [string, string][];
  startField: string;
  endField: string;
} | null {
  const formMatch = html.match(/<form[\s\S]*?<\/form>/i);
  const form = formMatch ? formMatch[0] : html;

  const fixedFields: [string, string][] = [];
  const textInputs: { name: string; idx: number }[] = [];
  const selects: {
    name: string;
    idx: number;
    options: { value: string; label: string; selected: boolean }[];
  }[] = [];
  const submits: { name: string; value: string; idx: number }[] = [];

  for (const m of form.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const name = tagAttr(tag, "name");
    if (!name) continue;
    const type = (tagAttr(tag, "type") || "text").toLowerCase();
    const value = tagAttr(tag, "value") ?? "";
    if (type === "hidden") {
      fixedFields.push([name, value]);
    } else if (type === "submit" || type === "image") {
      submits.push({ name, value, idx: m.index ?? 0 });
    } else if (type === "checkbox" || type === "radio") {
      if (/[\s'"]checked/i.test(tag)) fixedFields.push([name, value || "on"]);
    } else if (type === "text" || type === "date") {
      textInputs.push({ name, idx: m.index ?? 0 });
    }
  }

  for (const m of form.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)) {
    const block = m[0];
    const name = tagAttr(block, "name");
    if (!name) continue;
    const options: { value: string; label: string; selected: boolean }[] = [];
    for (const o of block.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const optTag = `<option ${o[1]} >`;
      const label = o[2]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;?/gi, " ")
        .trim();
      options.push({
        value: tagAttr(optTag, "value") ?? label,
        label,
        selected: /[\s'"]selected/i.test(o[1]),
      });
    }
    selects.push({ name, idx: m.index ?? 0, options });
  }

  for (const m of form.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const btnTag = `<button ${m[1]} >`;
    const name = tagAttr(btnTag, "name");
    if (!name) continue;
    const type = (tagAttr(btnTag, "type") || "submit").toLowerCase();
    if (type === "submit") {
      submits.push({
        name,
        value: tagAttr(btnTag, "value") ?? m[2].replace(/<[^>]*>/g, "").trim(),
        idx: m.index ?? 0,
      });
    }
  }

  if (textInputs.length < 2) return null;
  textInputs.sort((a, b) => a.idx - b.idx);
  const startField = textInputs[0].name;
  const endField = textInputs[1].name;

  selects.sort((a, b) => a.idx - b.idx);
  const timeSelects = selects.filter((s) =>
    s.options.some((o) => timeRank(o.label) !== null)
  );
  for (const s of selects) {
    let chosen: string | undefined;
    if (timeSelects.length === 2 && s === timeSelects[0]) {
      chosen = [...s.options]
        .filter((o) => timeRank(o.label) !== null)
        .sort((a, b) => timeRank(a.label)! - timeRank(b.label)!)[0]?.value;
    } else if (timeSelects.length === 2 && s === timeSelects[1]) {
      chosen = [...s.options]
        .filter((o) => timeRank(o.label) !== null)
        .sort((a, b) => timeRank(b.label)! - timeRank(a.label)!)[0]?.value;
    }
    if (chosen === undefined) {
      chosen = (s.options.find((o) => o.selected) ?? s.options[0])?.value;
    }
    fixedFields.push([s.name, chosen ?? ""]);
  }

  if (submits.length > 0) {
    const preferred =
      submits.find((s) =>
        /search|run|go|find|view|submit|period|ok/i.test(`${s.name} ${s.value}`)
      ) ?? [...submits].sort((a, b) => a.idx - b.idx)[0];
    fixedFields.push([preferred.name, preferred.value]);
  }

  return { fixedFields, startField, endField };
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

  // ksys22 displays and expects dates as MM/DD/YY (2-digit year).
  const toMdy = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y.slice(-2)}`;
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
      ...form.fixedFields.filter(
        ([name]) => name !== form.startField && name !== form.endField
      ),
      [form.startField, toMdy(startDate)],
      [form.endField, toMdy(endDate)],
    ];
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
