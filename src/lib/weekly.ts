import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRevenueResponse, type RevenueData } from "@/lib/revenue-parser";
import { fetchRevenueByDate } from "@/lib/revenue-fetch";
import { companyShare, hasReportRows, logFetchFailure } from "@/lib/clears";
import { BUSINESS_TIME_ZONE } from "@/lib/snapshots";

export const STATE_ORDER = ["TX", "VA", "FL"];

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Today's date (YYYY-MM-DD) in the business time zone. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The hour of day (0-23) right now in the business time zone. */
export function businessHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

/** The hour (Eastern) the Monday notification goes out in. */
export const WEEKLY_SEND_HOUR = 11;

/** Monday of the week containing the given date. */
export function mondayOf(iso: string): string {
  const day = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

/** The last full Monday-to-Sunday week before today, and the one before it. */
export function lastTwoWeeks(now: Date = new Date()) {
  const thisMonday = mondayOf(businessToday(now));
  const lastStart = addDays(thisMonday, -7);
  const prevStart = addDays(thisMonday, -14);
  return {
    last: { start: lastStart, end: addDays(lastStart, 6) },
    previous: { start: prevStart, end: addDays(prevStart, 6) },
  };
}

export const weekEnd = (weekStart: string) => addDays(weekStart, 6);

/**
 * A location's figures for a date range, guarded against meter resets.
 *
 * ksys22 reports each machine's Period In and Period Out as the end meter
 * minus the start meter. If a machine's meter was cleared, reset or swapped
 * inside the range, the end meter is below the start meter and that machine
 * shows a large negative amount. Such a machine is counted from zero, so a
 * reset can never drag the week below what was really taken.
 *
 * Net can still be negative when a location genuinely paid out more than it
 * took in; that is real and is kept.
 */
export function weekFigures(parsed: RevenueData): {
  cash_in: number;
  cash_out: number;
  net_revenue: number;
} {
  if (parsed.machine_lines.length === 0) {
    const cashIn = Math.max(0, parsed.cash_in);
    const cashOut = Math.max(0, parsed.cash_out);
    return { cash_in: cashIn, cash_out: cashOut, net_revenue: cashIn - cashOut };
  }
  let cashIn = 0;
  let cashOut = 0;
  for (const line of parsed.machine_lines) {
    cashIn += Math.max(0, line.cash_in);
    cashOut += Math.max(0, line.cash_out);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    cash_in: round(cashIn),
    cash_out: round(cashOut),
    net_revenue: round(cashIn - cashOut),
  };
}

interface WeeklyLocation {
  id: string;
  location_number: string;
  state: string;
  revenue_url: string;
  percentage_share: number;
  fees: number;
}

export interface WeekFetchResult {
  week_start: string;
  fetched: number;
  already: number;
  errors: { location_number: string; error: string }[];
  remaining: number;
}

/**
 * Read one week's revenue for every active location that does not have it
 * yet and store it in weekly_revenue. Strictly one location at a time
 * (ksys22 returns empty reports to overlapping sign-ins). Stops when the
 * deadline passes; calling again picks up where it left off.
 */
export async function fetchWeek(
  service: SupabaseClient,
  weekStart: string,
  deadline: number,
  performedBy: string | null
): Promise<WeekFetchResult> {
  const end = weekEnd(weekStart);

  const [{ data: locations }, { data: existing }] = await Promise.all([
    service
      .from("locations")
      .select("id, location_number, state, revenue_url, percentage_share, fees")
      .not("revenue_url", "is", null)
      .is("close_date", null)
      .order("location_number"),
    service.from("weekly_revenue").select("location_id").eq("week_start", weekStart),
  ]);

  const done = new Set((existing ?? []).map((r) => r.location_id));
  const queue = ((locations ?? []) as WeeklyLocation[]).filter(
    (l) => !done.has(l.id)
  );
  const result: WeekFetchResult = {
    week_start: weekStart,
    fetched: 0,
    already: done.size,
    errors: [],
    remaining: 0,
  };

  while (queue.length > 0 && Date.now() < deadline) {
    const loc = queue.shift()!;
    try {
      const { revenueHtml } = await fetchRevenueByDate(
        loc.revenue_url,
        weekStart,
        end,
        { withDevices: false }
      );
      const parsed = parseRevenueResponse(revenueHtml);
      if (!hasReportRows(revenueHtml, parsed)) {
        throw new Error("ksys22 returned an empty report");
      }
      const fees = Number(loc.fees);
      const share = Number(loc.percentage_share);
      const week = weekFigures(parsed);
      const { error } = await service.from("weekly_revenue").upsert({
        week_start: weekStart,
        location_id: loc.id,
        state: loc.state,
        cash_in: week.cash_in,
        cash_out: week.cash_out,
        net_revenue: week.net_revenue,
        fee_amount: fees,
        company_share_pct: share,
        company_revenue: companyShare(week.net_revenue, fees, share),
        fetched_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      result.fetched++;
    } catch (err) {
      result.errors.push({ location_number: loc.location_number, error: String(err) });
      await logFetchFailure(service, loc.id, err, performedBy);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  result.remaining = queue.length;
  return result;
}

export interface StateWeekTotal {
  state: string;
  locations: number;
  net: number;
  company: number;
}

/** Totals per state for one stored week. */
export async function stateTotals(
  service: SupabaseClient,
  weekStart: string
): Promise<Map<string, StateWeekTotal>> {
  const { data } = await service
    .from("weekly_revenue")
    .select("state, net_revenue, company_revenue")
    .eq("week_start", weekStart);
  const totals = new Map<string, StateWeekTotal>();
  for (const row of data ?? []) {
    const t =
      totals.get(row.state) ??
      { state: row.state, locations: 0, net: 0, company: 0 };
    t.locations++;
    t.net += Number(row.net_revenue);
    t.company += Number(row.company_revenue);
    totals.set(row.state, t);
  }
  return totals;
}

const dollars = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

/** "+5.2%" / "-3.1%", or "new" when there is nothing to compare against. */
export function changeLabel(current: number, previous: number | undefined): string {
  if (previous === undefined) return "new";
  if (previous === 0) return current === 0 ? "0%" : "new";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** The Monday notification text: one line per state, then the total. */
export function weeklyMessage(
  weekStart: string,
  current: Map<string, StateWeekTotal>,
  previous: Map<string, StateWeekTotal>,
  unread: number
): { title: string; body: string } {
  const states = [
    ...STATE_ORDER.filter((s) => current.has(s)),
    ...[...current.keys()].filter((s) => !STATE_ORDER.includes(s)).sort(),
  ];
  const lines = states.map((s) => {
    const now = current.get(s)!;
    const before = previous.get(s);
    return `${s} ${dollars(now.net)} net (${changeLabel(now.net, before?.net)}), ${dollars(now.company)} ours`;
  });

  const sum = (m: Map<string, StateWeekTotal>, k: "net" | "company") =>
    [...m.values()].reduce((t, x) => t + x[k], 0);
  const totalNow = sum(current, "net");
  const totalBefore = previous.size ? sum(previous, "net") : undefined;
  if (states.length > 1) {
    lines.push(
      `Total ${dollars(totalNow)} net (${changeLabel(totalNow, totalBefore)}), ${dollars(sum(current, "company"))} ours`
    );
  }
  if (unread > 0) {
    lines.push(`${unread} location${unread === 1 ? "" : "s"} could not be read`);
  }

  return {
    title: `Weekly revenue, ${shortDate(weekStart)} to ${shortDate(weekEnd(weekStart))}`,
    body: lines.join("\n") || "No revenue was read for last week.",
  };
}
