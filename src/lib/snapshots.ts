import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOCATION_SNAPSHOT_COLUMNS,
  MACHINE_SNAPSHOT_COLUMNS,
  DISPENSER_SNAPSHOT_COLUMNS,
  previousMonth,
  type SnapshotData,
} from "@/lib/snapshot-diff";

/** The business runs on US Eastern time; month boundaries follow it. */
export const BUSINESS_TIME_ZONE = "America/New_York";

/** Current 'YYYY-MM' in the business time zone. */
export function currentBusinessMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** Read the current state of locations, machines and dispensers. */
export async function readSnapshotData(
  db: SupabaseClient
): Promise<SnapshotData> {
  const [locations, machines, dispensers] = await Promise.all([
    db.from("locations").select(LOCATION_SNAPSHOT_COLUMNS).order("location_number"),
    db.from("machines").select(MACHINE_SNAPSHOT_COLUMNS),
    db.from("dispensers").select(DISPENSER_SNAPSHOT_COLUMNS),
  ]);
  if (locations.error) throw new Error(locations.error.message);
  if (machines.error) throw new Error(machines.error.message);
  if (dispensers.error) throw new Error(dispensers.error.message);
  return {
    locations: (locations.data ?? []) as unknown as SnapshotData["locations"],
    machines: (machines.data ?? []) as unknown as SnapshotData["machines"],
    dispensers: (dispensers.data ?? []) as unknown as SnapshotData["dispensers"],
  };
}

export interface SnapshotOutcome {
  month: string;
  taken: boolean;
  baseline: boolean;
}

/**
 * Make sure the month that just ended has a snapshot.
 *
 * The daily job runs shortly after midnight Eastern, so on the 1st the
 * data is still the month-end state and is saved under the previous month.
 * If a run was missed, the snapshot is taken on the next run instead. The
 * very first snapshot is a baseline: it is filed under the previous month so
 * the current month's changes can be reported from it.
 */
export async function ensureMonthlySnapshot(
  service: SupabaseClient,
  now: Date = new Date()
): Promise<SnapshotOutcome> {
  const month = previousMonth(currentBusinessMonth(now));

  const { data: existing } = await service
    .from("monthly_snapshots")
    .select("month")
    .eq("month", month)
    .maybeSingle();
  if (existing) return { month, taken: false, baseline: false };

  const { count } = await service
    .from("monthly_snapshots")
    .select("month", { count: "exact", head: true });
  const baseline = (count ?? 0) === 0;

  const data = await readSnapshotData(service);
  const { error } = await service
    .from("monthly_snapshots")
    .insert({ month, is_baseline: baseline, data });
  if (error) throw new Error(`Snapshot failed: ${error.message}`);

  return { month, taken: true, baseline };
}
