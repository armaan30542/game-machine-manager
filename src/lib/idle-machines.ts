/**
 * Zero-revenue machine detection.
 *
 * A machine line counts as "zero revenue" when it earned nothing (or less
 * than nothing) in the latest fetched revenue period.
 */

/** Whole days between a YYYY-MM-DD date and today. */
export function daysSince(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

export function isLineIdle(line: { net_revenue: number | string }): boolean {
  return Number(line.net_revenue) <= 0;
}
