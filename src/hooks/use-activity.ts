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
      // performed_by references auth.users, which has no foreign key to
      // public.profiles - embedding the profile here would error and drop
      // the entire result, so fetch and join the user separately.
      const { data, error } = await supabase
        .from("audit_log")
        .select(
          "*, locations:location_id(location_number, name), machines:machine_id(machine_type, serial_number)"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const entries = (data ?? []) as AuditLogEntry[];

      const userIds = [
        ...new Set(
          entries
            .map((e) => e.performed_by)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds);
        const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
        for (const entry of entries) {
          entry.profiles = entry.performed_by
            ? byId.get(entry.performed_by) ?? null
            : null;
        }
      }
      return entries;
    },
  });
}
