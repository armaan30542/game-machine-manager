/**
 * Zero-revenue machine detection.
 *
 * A machine line counts as "zero revenue" only when its net revenue is
 * exactly $0 in the latest fetched revenue period - negative figures (a
 * machine that paid out more than it took in) are not included.
 */

/** Whole days between a YYYY-MM-DD date and today. */
export function daysSince(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

export function isLineIdle(line: { net_revenue: number | string }): boolean {
  return Number(line.net_revenue) === 0;
}
