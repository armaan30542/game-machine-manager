"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Machine, AuditLogEntry } from "@/types/database";

export function useMachineDetail(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["machine", id],
    queryFn: async () => {
      const [{ data: machine }, { data: auditLog }] = await Promise.all([
        supabase
          .from("machines")
          .select("*, locations:location_id(id, location_number, name)")
          .eq("id", id)
          .single(),
        supabase
          .from("audit_log")
          .select(
            "*, profiles:performed_by(email, full_name), locations:location_id(location_number, name)"
          )
          .eq("machine_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      return {
        machine: machine as (Machine & { locations: { id: string; location_number: string; name: string } | null }) | null,
        auditLog: (auditLog ?? []) as AuditLogEntry[],
      };
    },
  });
}
