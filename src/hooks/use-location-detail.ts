"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Location, Machine, Dispenser } from "@/types/database";

export function useLocationDetail(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["location", id],
    queryFn: async () => {
      const [
        { data: location },
        { data: machines },
        { data: dispenser },
        { data: inventoryMachines },
        { data: inventoryDispensers },
      ] = await Promise.all([
        supabase.from("locations").select("*").eq("id", id).single(),
        supabase.from("machines").select("*").eq("location_id", id).order("position_at_location"),
        supabase.from("dispensers").select("*").eq("location_id", id).maybeSingle(),
        supabase.from("machines").select("*").is("location_id", null).order("machine_type"),
        supabase.from("dispensers").select("*").is("location_id", null).order("serial_number"),
      ]);

      return {
        location: location as Location | null,
        machines: (machines ?? []) as Machine[],
        dispenser: dispenser as Dispenser | null,
        inventoryMachines: (inventoryMachines ?? []) as Machine[],
        inventoryDispensers: (inventoryDispensers ?? []) as Dispenser[],
      };
    },
  });
}
