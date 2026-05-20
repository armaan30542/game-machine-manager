/**
 * Idle-machine detection.
 *
 * A machine is "idle" when ksys22 has not recorded a fresh meter read for it
 * in IDLE_STALE_DAYS or more days (a never-read machine counts as idle). A
 * stale meter means the machine has earned nothing over that window.
 */
export const IDLE_STALE_DAYS = 2;

/** Whole days between a YYYY-MM-DD date and today. */
export function daysSince(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

export function isLineIdle(line: { last_read_date: string | null }): boolean {
  if (!line.last_read_date) return true;
  return daysSince(line.last_read_date) >= IDLE_STALE_DAYS;
}
