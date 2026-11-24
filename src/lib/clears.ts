import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseRevenueResponse,
  parseDeviceList,
  applyDeviceNames,
  type RevenueData,
} from "@/lib/revenue-parser";
import { fetchRevenuePage, fetchRevenueByDate } from "@/lib/revenue-fetch";

export interface RefreshLocation {
  id: string;
  revenue_url: string;
  percentage_share: number | string;
  fees: number | string;
}

export interface ClearedPeriodResult {
  period_start: string;
  period_end: string;
  cleared_on: string;
  net_revenue: number;
  company_revenue: number;
  source: "kpbd" | "last_seen";
}

export interface RefreshResult {
  parsed: RevenueData;
  companyRevenue: number;
  /** Set when this refresh found that the location was cleared. */
  cleared: ClearedPeriodResult | null;
}

/** YYYY-MM-DD for the day before an ISO date. */
export function dayBefore(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * True when a ksys22 report page actually carries rows.
 *
 * ksys22 sometimes answers with the report shell (title, column headers,
 * Totals label) but an empty table, most reliably when it is asked for more
 * than one location at a time. Such a page parses as zero revenue with a
 * default period start, so it must be treated as a failed read, never saved.
 * Every real row carries a start date and a last-read date.
 */
export function hasReportRows(html: string, parsed: RevenueData): boolean {
  return parsed.machine_lines.length > 0 || /\d{2}\/\d{2}\/\d{2,4}/.test(html);
}

export function companyShare(
  netRevenue: number,
  fees: number,
  sharePercent: number
): number {
  return (netRevenue - fees) * (sharePercent / 100);
}

/**
 * Refresh one location's current-period revenue from ksys22 and, if the
 * period start has moved forward since the last fetch, record the period
 * that just ended in cleared_periods.
 *
 * The cleared period runs from the previous period start to the day before
 * the new one. Its figures are re-read from ksys22 "Period by Date"; if that
 * read fails or comes back empty, the last figures seen before the clear are
 * kept instead (source = 'last_seen').
 *
 * Every revenue refresh (single fetch, fetch-all, daily job) goes through
 * here so a clear is never overwritten without being recorded.
 *
 * Call this for ONE location at a time. ksys22 ties a session to the
 * caller's address, and overlapping sign-ins make it return empty reports.
 */
export async function refreshLocationRevenue(
  service: SupabaseClient,
  loc: RefreshLocation
): Promise<RefreshResult> {
  const { revenueHtml, deviceHtml } = await fetchRevenuePage(loc.revenue_url);
  const parsed = parseRevenueResponse(revenueHtml);
  if (!hasReportRows(revenueHtml, parsed)) {
    throw new Error("ksys22 returned an empty report; nothing was saved");
  }
  const machineLines = applyDeviceNames(
    parsed.machine_lines,
    parseDeviceList(deviceHtml)
  );

  const feeAmount = Number(loc.fees);
  const sharePercent = Number(loc.percentage_share);
  const companyRevenue = companyShare(
    parsed.net_revenue,
    feeAmount,
    sharePercent
  );

  const { data: prevRow } = await service
    .from("revenue_records")
    .select("period_start, period_end, cash_in, cash_out, net_revenue, raw_data")
    .eq("location_id", loc.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // A stored row that came from an empty report says nothing about the
  // period, so it cannot be the baseline for detecting a clear.
  const prev =
    prevRow &&
    (typeof prevRow.raw_data !== "string" ||
      /\d{2}\/\d{2}\/\d{2,4}/.test(prevRow.raw_data))
      ? prevRow
      : null;

  let cleared: ClearedPeriodResult | null = null;
  const today = new Date().toISOString().slice(0, 10);

  if (
    prev &&
    parsed.period_start > prev.period_start &&
    parsed.period_start <= today
  ) {
    const periodStart = prev.period_start as string;
    let periodEnd = dayBefore(parsed.period_start);
    if (periodEnd < periodStart) periodEnd = periodStart;

    let cashIn = Number(prev.cash_in);
    let cashOut = Number(prev.cash_out);
    let net = Number(prev.net_revenue);
    let source: "kpbd" | "last_seen" = "last_seen";

    try {
      const byDate = await fetchRevenueByDate(
        loc.revenue_url,
        periodStart,
        periodEnd
      );
      const closed = parseRevenueResponse(byDate.revenueHtml);
      // An empty report, or an all-zero result when the open period had
      // money in it, means the date-range read did not work; keep the last
      // figures seen instead.
      if (
        hasReportRows(byDate.revenueHtml, closed) &&
        (closed.cash_in > 0 || Number(prev.cash_in) === 0)
      ) {
        cashIn = closed.cash_in;
        cashOut = closed.cash_out;
        net = closed.net_revenue;
        source = "kpbd";
      }
    } catch (err) {
      console.error("Period-by-date read failed, keeping last seen:", err);
    }

    const closedCompany = companyShare(net, feeAmount, sharePercent);
    const { error: clearError } = await service.from("cleared_periods").upsert(
      {
        location_id: loc.id,
        period_start: periodStart,
        period_end: periodEnd,
        cleared_on: parsed.period_start,
        cash_in: cashIn,
        cash_out: cashOut,
        net_revenue: net,
        fee_amount: feeAmount,
        company_share_pct: sharePercent,
        company_revenue: closedCompany,
        source,
        last_seen_net: Number(prev.net_revenue),
      },
      { onConflict: "location_id,period_start,period_end", ignoreDuplicates: true }
    );
    if (clearError) {
      // Do not replace the open-period row if the clear could not be saved,
      // otherwise the clear would be lost for good.
      throw new Error(`Saving cleared period failed: ${clearError.message}`);
    }

    cleared = {
      period_start: periodStart,
      period_end: periodEnd,
      cleared_on: parsed.period_start,
      net_revenue: net,
      company_revenue: closedCompany,
      source,
    };
  }

  // Only delete the old open-period row once valid new data is in hand.
  const { error: deleteError } = await service
    .from("revenue_records")
    .delete()
    .eq("location_id", loc.id);
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const { data: newRecord, error: insertError } = await service
    .from("revenue_records")
    .insert({
      location_id: loc.id,
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      cash_in: parsed.cash_in,
      cash_out: parsed.cash_out,
      net_revenue: parsed.net_revenue,
      fee_amount: feeAmount,
      company_share_pct: sharePercent,
      company_revenue: companyRevenue,
      raw_data: revenueHtml,
      fetched_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  // Per-machine breakdown is best effort and must not fail the refresh.
  if (newRecord && machineLines.length > 0) {
    const { error: linesError } = await service
      .from("revenue_machine_lines")
      .insert(
        machineLines.map((l) => ({
          revenue_record_id: newRecord.id,
          location_id: loc.id,
          position: l.position,
          ksys_game_id: l.ksys_game_id,
          game_name: l.game_name,
          cash_in: l.cash_in,
          cash_out: l.cash_out,
          net_revenue: l.net_revenue,
          last_read_date: l.last_read_date,
        }))
      );
    if (linesError) {
      console.error("Machine lines insert error:", linesError.message);
    }
  }

  return { parsed, companyRevenue, cleared };
}

/**
 * Record a failed ksys22 read for a location in the audit log. The Estimates
 * page compares the newest failure with the newest successful read to list
 * locations whose link is broken. Never throws: logging must not mask the
 * original failure.
 */
export async function logFetchFailure(
  service: SupabaseClient,
  locationId: string,
  error: unknown,
  performedBy: string | null
): Promise<void> {
  try {
    await service.from("audit_log").insert({
      action: "revenue_fetch_failed",
      performed_by: performedBy,
      location_id: locationId,
      details: { error: String(error).replace(/^Error:\s*/, "").slice(0, 300) },
    });
  } catch (err) {
    console.error("Could not log fetch failure:", err);
  }
}
