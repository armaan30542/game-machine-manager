"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  diffSnapshots,
  LOCATION_SNAPSHOT_COLUMNS,
  MACHINE_SNAPSHOT_COLUMNS,
  DISPENSER_SNAPSHOT_COLUMNS,
  type SnapshotData,
  type SnapshotDiff,
} from "@/lib/snapshot-diff";
import type { MonthlySnapshotRow } from "@/types/database";

/** The month-end snapshots that exist, newest first. */
export function useSnapshotList() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["monthly-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, taken_at, is_baseline")
        .order("month", { ascending: false });
      return {
        snapshots: (data ?? []) as MonthlySnapshotRow[],
        notInstalled:
          !!error && (error.code === "42P01" || error.code === "PGRST205"),
      };
    },
  });
}

export interface MonthlyChanges {
  diff: SnapshotDiff;
  from: MonthlySnapshotRow;
  /** null when comparing against the live data ("so far this month"). */
  to: MonthlySnapshotRow | null;
}

/**
 * Changes for one selection.
 *  - a 'YYYY-MM' month: that month's snapshot against the one before it;
 *  - 'current': the newest snapshot against the live data.
 */
export function useMonthlyChanges(
  selection: string | null,
  snapshots: MonthlySnapshotRow[]
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["monthly-changes", selection, snapshots.map((s) => s.month).join()],
    enabled: !!selection && snapshots.length > 0,
    queryFn: async (): Promise<MonthlyChanges | null> => {
      const load = async (month: string): Promise<SnapshotData> => {
        const { data, error } = await supabase
          .from("monthly_snapshots")
          .select("data")
          .eq("month", month)
          .single();
        if (error) throw new Error(error.message);
        return data.data as SnapshotData;
      };

      if (selection === "current") {
        const from = snapshots[0];
        const [before, locations, machines, dispensers] = await Promise.all([
          load(from.month),
          supabase.from("locations").select(LOCATION_SNAPSHOT_COLUMNS),
          supabase.from("machines").select(MACHINE_SNAPSHOT_COLUMNS),
          supabase.from("dispensers").select(DISPENSER_SNAPSHOT_COLUMNS),
        ]);
        const after = {
          locations: locations.data ?? [],
          machines: machines.data ?? [],
          dispensers: dispensers.data ?? [],
        } as unknown as SnapshotData;
        return { diff: diffSnapshots(before, after), from, to: null };
      }

      const index = snapshots.findIndex((s) => s.month === selection);
      const to = snapshots[index];
      const from = snapshots[index + 1];
      if (!to || !from) return null;
      const [before, after] = await Promise.all([load(from.month), load(to.month)]);
      return { diff: diffSnapshots(before, after), from, to };
    },
  });
}
