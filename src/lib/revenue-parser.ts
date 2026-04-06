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

function parseDollar(str: string): number {
  // Parse strings like "$27,901.00" or "In $27,901.00"
  const match = str.match(/\$?([\d,]+\.?\d*)/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
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

function parseKsys22Html(html: string): RevenueData {
  const now = new Date();
  let cashIn = 0;
  let cashOut = 0;
  let netRevenue = 0;
  let periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  let periodEnd = now.toISOString().split("T")[0];

  // Extract the Totals row values: "In $X", "Out $X", "Net $X"
  const totalsInMatch = html.match(/In\s+\$?([\d,]+\.?\d*)/);
  const totalsOutMatch = html.match(/Out\s+\$?([\d,]+\.?\d*)/);
  const totalsNetMatch = html.match(/Net\s+\$?([\d,]+\.?\d*)/);

  if (totalsInMatch) {
    cashIn = Number(totalsInMatch[1].replace(/,/g, ""));
  }
  if (totalsOutMatch) {
    cashOut = Number(totalsOutMatch[1].replace(/,/g, ""));
  }
  if (totalsNetMatch) {
    netRevenue = Number(totalsNetMatch[1].replace(/,/g, ""));
  }

  // If totals row parsing didn't work, try summing Period In/Out/Net columns
  // by looking for dollar amounts in table cells
  if (cashIn === 0 && cashOut === 0) {
    // Find all "Period In" values (column 8 in each game row)
    const periodInMatches = html.match(/Period In[\s\S]*?<\/tr>/gi);
    if (!periodInMatches) {
      // Try finding all dollar amounts after "Period In" header
      const allDollarMatches = [...html.matchAll(/\$([\d,]+\.?\d*)/g)];
      // Sum them as fallback
      for (const m of allDollarMatches) {
        cashIn += Number(m[1].replace(/,/g, ""));
      }
    }
  }

  // Extract period dates from the game rows
  // Start Date is typically in the 2nd column, Last Read Date in the 3rd
  // Look for date patterns like "03/31/26"
  const dateMatches = [...html.matchAll(/(\d{2}\/\d{2}\/\d{2,4})/g)];
  if (dateMatches.length >= 2) {
    // First date is the Start Date (period start)
    periodStart = parseDate(dateMatches[0][1]);
    // Find the last "Last Read Date" which is the period end
    // Last Read Dates appear as the second date in each row
    // We want the latest one
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
