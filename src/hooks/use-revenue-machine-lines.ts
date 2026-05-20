"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { RevenueMachineLine } from "@/types/database";

export function useRevenueMachineLines(revenueRecordId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["revenue-machine-lines", revenueRecordId],
    enabled: !!revenueRecordId,
    queryFn: async () => {
      const { data } = await supabase
        .from("revenue_machine_lines")
        .select("*")
        .eq("revenue_record_id", revenueRecordId!)
        .order("position", { ascending: true });
      return (data ?? []) as RevenueMachineLine[];
    },
  });
}
