"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { RevenueRecord, Location } from "@/types/database";

export interface RevenueRecordWithLocation extends RevenueRecord {
  locations: Pick<Location, "location_number" | "name" | "state"> | null;
}

export function useRevenue() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["revenue"],
    queryFn: async () => {
      const [{ data: revenueRecords }, { data: locations }] = await Promise.all([
        supabase
          .from("revenue_records")
          .select("*, locations:location_id(location_number, name, state)")
          .order("period_end", { ascending: false }),
        supabase
          .from("locations")
          .select("id, location_number, name, state, percentage_share, fees, revenue_url")
          .is("close_date", null)
          .order("location_number"),
      ]);

      return {
        revenueRecords: (revenueRecords ?? []) as RevenueRecordWithLocation[],
        locations: (locations ?? []) as Pick<
          Location,
          "id" | "location_number" | "name" | "state" | "percentage_share" | "fees" | "revenue_url"
        >[],
      };
    },
  });
}
