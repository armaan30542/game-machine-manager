export interface RevenueData {
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  period_start: string;
  period_end: string;
}

/**
 * Parse revenue data from ksys22.com HTML response.
 *
 * The HTML contains a table with per-game rows and a Totals row like:
 *   Totals | In $27,901.00 | Out $16,270.29 | Net $11,630.71 | Hold 41.7%
 *
 * Each game row has columns:
 *   Game | Start Date | Last Read Date | Start M In | Start M Out |
 *   End M In | End M Out | Period In | Period Out | Period Net | Hold
 */
export function parseRevenueResponse(rawData: string): RevenueData {
  // Try JSON first (unlikely but safe fallback)
  try {
    const json = JSON.parse(rawData);
    return parseJsonRevenue(json);
  } catch {
    // Not JSON, parse as HTML
  }

  return parseKsys22Html(rawData);
}

function parseJsonRevenue(json: Record<string, unknown>): RevenueData {
  const cashIn = Number(json.cashIn ?? json.cash_in ?? json.CashIn ?? 0);
  const cashOut = Number(json.cashOut ?? json.cash_out ?? json.CashOut ?? 0);
  const netRevenue = Number(
    json.netRevenue ?? json.net_revenue ?? json.NetRevenue ?? cashIn - cashOut
  );

  const now = new Date();
  const periodStart =
    (json.periodStart as string) ??
    (json.period_start as string) ??
    (json.startDate as string) ??
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const periodEnd =
    (json.periodEnd as string) ??
    (json.period_end as string) ??
    (json.endDate as string) ??
    now.toISOString().split("T")[0];

  return { cash_in: cashIn, cash_out: cashOut, net_revenue: netRevenue, period_start: periodStart, period_end: periodEnd };
}

function parseDate(str: string): string {
  // Parse "03/31/26" -> "2026-03-31"
  const match = str.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!match) return new Date().toISOString().split("T")[0];

  const month = match[1];
  const day = match[2];
  let year = match[3];
  if (year.length === 2) {
    year = "20" + year;
  }
  return `${year}-${month}-${day}`;
}

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, " ");
}

function parseKsys22Html(html: string): RevenueData {
  const now = new Date();
  let cashIn = 0;
  let cashOut = 0;
  let netRevenue = 0;
  let periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  let periodEnd = now.toISOString().split("T")[0];

  // Strip all HTML tags first so values like "$<font color="#000">11,630.71"
  // become "$11,630.71"
  const clean = stripHtmlTags(html);

  // Find the Totals row - it contains "Totals" followed by "In $X", "Out $X", "Net $X"
  // We match from "Totals" to end to avoid hitting "Start M In" etc in data rows
  const totalsSection = clean.match(/Totals[\s\S]*/);
  if (totalsSection) {
    const totals = totalsSection[0];
    const inMatch = totals.match(/In\s+\$?\s*([\d,]+\.?\d*)/);
    const outMatch = totals.match(/Out\s+\$?\s*([\d,]+\.?\d*)/);
    const netMatch = totals.match(/Net\s+\$?\s*([\d,]+\.?\d*)/);

    if (inMatch) cashIn = Number(inMatch[1].replace(/,/g, ""));
    if (outMatch) cashOut = Number(outMatch[1].replace(/,/g, ""));
    if (netMatch) netRevenue = Number(netMatch[1].replace(/,/g, ""));
  }

  // Extract period dates from the game rows
  // Dates appear as "03/31/26" - first is Start Date, we want earliest and latest
  const dateMatches = [...clean.matchAll(/(\d{2}\/\d{2}\/\d{2,4})/g)];
  if (dateMatches.length >= 2) {
    periodStart = parseDate(dateMatches[0][1]);
    let latestEnd = periodStart;
    for (const m of dateMatches) {
      const parsed = parseDate(m[1]);
      if (parsed > latestEnd) {
        latestEnd = parsed;
      }
    }
    periodEnd = latestEnd;
  }

  // If net_revenue is 0 but we have cash_in and cash_out, calculate it
  if (netRevenue === 0 && cashIn > 0) {
    netRevenue = cashIn - cashOut;
  }

  return {
    cash_in: cashIn,
    cash_out: cashOut,
    net_revenue: netRevenue,
    period_start: periodStart,
    period_end: periodEnd,
  };
}
