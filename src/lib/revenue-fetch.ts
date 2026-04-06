/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 * Some URLs are like "https://ksys22.com/ksals20/" and need "kperiod.php" appended.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  // Remove trailing slash and append kperiod.php
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Build auth headers for ksys22 revenue API.
 */
export function buildRevenueHeaders(): Record<string, string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  const headers: Record<string, string> = {};
  if (username && password) {
    headers["Authorization"] = `Basic ${Buffer.from(
      `${username}:${password}`
    ).toString("base64")}`;
  }
  return headers;
}
