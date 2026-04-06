"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { LocationWithCounts } from "@/types/database";

export function useLocations() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("locations")
        .select("*, machines(count), dispensers(count)")
        .order("location_number");
      return (data ?? []) as LocationWithCounts[];
    },
  });
}
