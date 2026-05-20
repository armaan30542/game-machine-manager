"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AuditLogEntry } from "@/types/database";

export function useActivity() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["activity"],
    // Always refetch when the page opens so newly-logged actions show up
    // even if the action that wrote them did not invalidate this query.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select(
          "*, profiles:performed_by(email, full_name), locations:location_id(location_number, name), machines:machine_id(machine_type, serial_number)"
        )
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as AuditLogEntry[];
    },
  });
}
