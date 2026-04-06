import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

// Remote chromium binary for Vercel serverless (no local bin needed)
const CHROMIUM_REMOTE_URL =
  "https://github.com/nicholasgasior/chromium-brotli-lambda-layer/releases/download/v133.0.0/chromium-v133.0.0-pack.tar";

/**
 * Normalize a ksys22 revenue URL to ensure it points to the period page.
 */
export function normalizeRevenueUrl(url: string): string {
  if (url.endsWith("kperiod.php")) return url;
  const base = url.endsWith("/") ? url : url + "/";
  return base + "kperiod.php";
}

/**
 * Fetch revenue page from ksys22 using Puppeteer headless browser.
 * This handles form-based login with cookies/sessions automatically.
 */
export async function fetchRevenuePage(revenueUrl: string): Promise<string> {
  const username = process.env.REVENUE_API_USERNAME;
  const password = process.env.REVENUE_API_PASSWORD;

  if (!username || !password) {
    throw new Error("REVENUE_API_USERNAME and REVENUE_API_PASSWORD must be set");
  }

  const baseUrl = revenueUrl.endsWith("kperiod.php")
    ? revenueUrl.replace("kperiod.php", "")
    : revenueUrl.endsWith("/") ? revenueUrl : revenueUrl + "/";

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Go to the login page
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    // Fill in the login form
    // Username field has an obfuscated name, so find it by type
    await page.type("input[type='text']", username);
    await page.type("input[type='password']", password);

    // Submit the form and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
      page.click("input[type='submit']"),
    ]);

    // Navigate to the period page if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes("kperiod.php")) {
      await page.goto(baseUrl + "kperiod.php", {
        waitUntil: "networkidle0",
        timeout: 15000,
      });
    }

    // Get the page HTML
    const html = await page.content();

    if (html.includes("klogin.css")) {
      throw new Error("Login failed - still on login page after form submission");
    }

    return html;
  } finally {
    await browser.close();
  }
}
