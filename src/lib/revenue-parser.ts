export interface RevenueData {
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  period_start: string;
  period_end: string;
}

/**
 * Parse revenue data from an external URL response.
 * This module is designed to be swappable based on the actual
 * format of the revenue data source.
 *
 * Adapt the parse function once the actual URL response format is known.
 */
export function parseRevenueResponse(rawData: string): RevenueData {
  // Strategy 1: Try parsing as JSON
  try {
    const json = JSON.parse(rawData);
    return parseJsonRevenue(json);
  } catch {
    // Not JSON
  }

  // Strategy 2: Try parsing as HTML (extract from tables/elements)
  return parseHtmlRevenue(rawData);
}

function parseJsonRevenue(json: Record<string, unknown>): RevenueData {
  // Adapt field names based on actual API response
  const cashIn =
    Number(json.cashIn ?? json.cash_in ?? json.CashIn ?? 0);
  const cashOut =
    Number(json.cashOut ?? json.cash_out ?? json.CashOut ?? 0);
  const netRevenue =
    Number(
      json.netRevenue ??
        json.net_revenue ??
        json.NetRevenue ??
        cashIn - cashOut
    );

  // Date handling
  const now = new Date();
  const periodStart =
    (json.periodStart as string) ??
    (json.period_start as string) ??
    (json.startDate as string) ??
    new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
  const periodEnd =
    (json.periodEnd as string) ??
    (json.period_end as string) ??
    (json.endDate as string) ??
    now.toISOString().split("T")[0];

  return {
    cash_in: cashIn,
    cash_out: cashOut,
    net_revenue: netRevenue,
    period_start: periodStart,
    period_end: periodEnd,
  };
}

function parseHtmlRevenue(html: string): RevenueData {
  // Extract numbers from HTML using regex patterns
  // This should be adapted based on actual HTML structure

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const periodEnd = now.toISOString().split("T")[0];

  // Look for common patterns like "Cash In: $1,234.56"
  const cashInMatch = html.match(
    /cash\s*in[:\s]*\$?([\d,]+\.?\d*)/i
  );
  const cashOutMatch = html.match(
    /cash\s*out[:\s]*\$?([\d,]+\.?\d*)/i
  );
  const netMatch = html.match(
    /net\s*(?:revenue|income)?[:\s]*\$?([\d,]+\.?\d*)/i
  );

  const cashIn = cashInMatch
    ? Number(cashInMatch[1].replace(/,/g, ""))
    : 0;
  const cashOut = cashOutMatch
    ? Number(cashOutMatch[1].replace(/,/g, ""))
    : 0;
  const netRevenue = netMatch
    ? Number(netMatch[1].replace(/,/g, ""))
    : cashIn - cashOut;

  return {
    cash_in: cashIn,
    cash_out: cashOut,
    net_revenue: netRevenue,
    period_start: periodStart,
    period_end: periodEnd,
  };
}
