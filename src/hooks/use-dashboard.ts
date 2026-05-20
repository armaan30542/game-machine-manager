"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface DeployedMachineRow {
  id: string;
  machine_type: string;
  cabinet_type: string;
  position_at_location: number | null;
  locations: { location_number: string; name: string; state: string } | null;
}

export function useDashboardData() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [
        { count: totalLocations },
        { count: activeLocations },
        { data: stateBreakdown },
        { count: deployedMachines },
        { count: inventoryMachines },
        { count: deployedDispensers },
        { count: inventoryDispensers },
        { data: recentActivity },
        { data: deployedMachineList },
      ] = await Promise.all([
        supabase.from("locations").select("*", { count: "exact", head: true }),
        supabase.from("locations").select("*", { count: "exact", head: true }).is("close_date", null),
        supabase.from("locations").select("state").is("close_date", null),
        supabase.from("machines").select("*", { count: "exact", head: true }).not("location_id", "is", null),
        supabase.from("machines").select("*", { count: "exact", head: true }).is("location_id", null),
        supabase.from("dispensers").select("*", { count: "exact", head: true }).not("location_id", "is", null),
        supabase.from("dispensers").select("*", { count: "exact", head: true }).is("location_id", null),
        supabase.from("audit_log")
          .select("*, profiles:performed_by(email, full_name), locations:location_id(location_number, name)")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("machines")
          .select(
            "id, machine_type, cabinet_type, position_at_location, locations:location_id(location_number, name, state)"
          )
          .not("location_id", "is", null)
          .order("machine_type"),
      ]);

      return {
        totalLocations: totalLocations ?? 0,
        activeLocations: activeLocations ?? 0,
        vaCount: stateBreakdown?.filter((l) => l.state === "VA").length ?? 0,
        txCount: stateBreakdown?.filter((l) => l.state === "TX").length ?? 0,
        deployedMachines: deployedMachines ?? 0,
        inventoryMachines: inventoryMachines ?? 0,
        deployedDispensers: deployedDispensers ?? 0,
        inventoryDispensers: inventoryDispensers ?? 0,
        recentActivity: recentActivity ?? [],
        deployedMachineList: (deployedMachineList ??
          []) as unknown as DeployedMachineRow[],
      };
    },
  });
}
