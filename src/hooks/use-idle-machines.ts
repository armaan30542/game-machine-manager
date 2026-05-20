"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { isLineIdle } from "@/lib/idle-machines";
import type { RevenueMachineLine } from "@/types/database";

export interface IdleLine extends RevenueMachineLine {
  locations: { location_number: string; name: string } | null;
}

export function useIdleMachines() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["idle-machines"],
    queryFn: async () => {
      const { data } = await supabase
        .from("revenue_machine_lines")
        .select("*, locations:location_id(location_number, name)")
        .order("last_read_date", { ascending: true, nullsFirst: true });

      const lines = (data ?? []) as IdleLine[];
      const flagged = lines.filter((l) => isLineIdle(l));
      return { flagged, count: flagged.length };
    },
  });
}
