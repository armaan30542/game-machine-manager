"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Location, WeeklyRevenueRow } from "@/types/database";

export type WeeklyLocation = Pick<
  Location,
  "id" | "location_number" | "name" | "state" | "revenue_url" | "close_date"
>;

/** How many weeks of history the page loads. */
const WEEKS_BACK = 16;

/** Stored weekly revenue (newest weeks first) and the locations it refers to. */
export function useWeekly() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["weekly-revenue"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - WEEKS_BACK * 7);

      const [rows, locations] = await Promise.all([
        supabase
          .from("weekly_revenue")
          .select("*")
          .gte("week_start", since.toISOString().slice(0, 10))
          .order("week_start", { ascending: false }),
        supabase
          .from("locations")
          .select("id, location_number, name, state, revenue_url, close_date")
          .order("location_number"),
      ]);

      const data = (rows.data ?? []) as WeeklyRevenueRow[];
      return {
        rows: data,
        weeks: [...new Set(data.map((r) => r.week_start))],
        locations: (locations.data ?? []) as WeeklyLocation[],
        // A missing table means database script 010 has not been run yet.
        notInstalled:
          !!rows.error &&
          (rows.error.code === "42P01" || rows.error.code === "PGRST205"),
      };
    },
  });
}
