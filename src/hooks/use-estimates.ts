"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ClearedPeriod,
  Location,
  RevenueRecord,
  SettlementEstimate,
} from "@/types/database";

export type EstimateLocation = Pick<
  Location,
  | "id"
  | "location_number"
  | "name"
  | "state"
  | "percentage_share"
  | "fees"
  | "revenue_url"
  | "close_date"
>;

export type RunningRecord = Pick<
  RevenueRecord,
  "location_id" | "period_start" | "net_revenue" | "company_revenue" | "fetched_at"
>;

export interface FetchFailure {
  location_id: string;
  created_at: string;
  error: string;
}

/**
 * Everything the Estimates page needs:
 *  - cleared periods no settlement sheet has claimed yet,
 *  - the open (running) period per location,
 *  - the snapshots taken for past settlement sheets (admin only by RLS),
 *  - for the link report: the newest failed ksys22 read per location and
 *    the newest date any of its machines reported.
 */
export function useEstimates() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["estimates"],
    queryFn: async () => {
      const [locations, open, running, settlements, failures, lines] =
        await Promise.all([
          supabase
            .from("locations")
            .select(
              "id, location_number, name, state, percentage_share, fees, revenue_url, close_date"
            )
            .order("location_number"),
          supabase
            .from("cleared_periods")
            .select("*")
            .is("settlement_ref", null)
            .order("cleared_on", { ascending: false }),
          supabase
            .from("revenue_records")
            .select("location_id, period_start, net_revenue, company_revenue, fetched_at"),
          supabase
            .from("settlement_estimates")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase
            .from("audit_log")
            .select("location_id, created_at, details")
            .eq("action", "revenue_fetch_failed")
            .order("created_at", { ascending: false })
            .limit(500),
          supabase
            .from("revenue_machine_lines")
            .select("location_id, last_read_date"),
        ]);

      // Newest failure per location (rows arrive newest first).
      const latestFailure = new Map<string, FetchFailure>();
      for (const row of failures.data ?? []) {
        if (!row.location_id || latestFailure.has(row.location_id)) continue;
        const details = row.details as { error?: unknown } | null;
        latestFailure.set(row.location_id, {
          location_id: row.location_id,
          created_at: row.created_at,
          error: typeof details?.error === "string" ? details.error : "Read failed",
        });
      }

      // Newest machine read date per location.
      const lastMachineRead = new Map<string, string>();
      for (const row of lines.data ?? []) {
        if (!row.last_read_date) continue;
        const prev = lastMachineRead.get(row.location_id);
        if (!prev || row.last_read_date > prev) {
          lastMachineRead.set(row.location_id, row.last_read_date);
        }
      }

      return {
        locations: (locations.data ?? []) as EstimateLocation[],
        openPeriods: (open.data ?? []) as ClearedPeriod[],
        running: (running.data ?? []) as RunningRecord[],
        settlements: (settlements.data ?? []) as SettlementEstimate[],
        latestFailure,
        lastMachineRead,
        // A missing table means the database script has not been run yet.
        notInstalled:
          !!open.error &&
          (open.error.code === "42P01" || open.error.code === "PGRST205"),
      };
    },
  });
}
