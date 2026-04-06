"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Machine, Dispenser } from "@/types/database";

export function useInventory() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const [{ data: machines }, { data: dispensers }] = await Promise.all([
        supabase.from("machines").select("*").is("location_id", null).order("machine_type"),
        supabase.from("dispensers").select("*").is("location_id", null).order("serial_number"),
      ]);

      return {
        machines: (machines ?? []) as Machine[],
        dispensers: (dispensers ?? []) as Dispenser[],
      };
    },
  });
}
