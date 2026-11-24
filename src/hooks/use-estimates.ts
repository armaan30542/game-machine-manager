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

/**
 * Everything the Estimates page needs:
 *  - cleared periods no settlement sheet has claimed yet,
 *  - the open (running) period per location,
 *  - the snapshots taken for past settlement sheets (admin only by RLS).
 */
export function useEstimates() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["estimates"],
    queryFn: async () => {
      const [locations, open, running, settlements] = await Promise.all([
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
      ]);

      return {
        locations: (locations.data ?? []) as EstimateLocation[],
        openPeriods: (open.data ?? []) as ClearedPeriod[],
        running: (running.data ?? []) as RunningRecord[],
        settlements: (settlements.data ?? []) as SettlementEstimate[],
        // A missing table means the database script has not been run yet.
        notInstalled:
          !!open.error &&
          (open.error.code === "42P01" || open.error.code === "PGRST205"),
      };
    },
  });
}
