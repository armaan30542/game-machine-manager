"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AuditLogEntry } from "@/types/database";

export interface LocationChangeRow {
  /** Unique per row - a location added AND closed in range yields two rows. */
  id: string;
  location_number: string;
  name: string;
  city: string;
  state: "VA" | "TX";
  change: "added" | "closed";
  /** Raw value used for sorting (ISO timestamp or YYYY-MM-DD). */
  sortKey: string;
  /** Pre-formatted date for display. */
  dateDisplay: string;
}

export interface MachineChangeRow extends AuditLogEntry {
  locations: {
    location_number: string;
    name: string;
    state: "VA" | "TX";
  } | null;
  machines: {
    machine_type: string;
    cabinet_type: string;
    serial_number: string | null;
  } | null;
}

export interface NewInventoryRow {
  id: string;
  machine_type: string;
  cabinet_type: string;
  serial_number: string | null;
  created_at: string;
  location_id: string | null;
  locations: { location_number: string; name: string } | null;
}

export const MACHINE_CHANGE_ACTIONS = [
  "machine_added_to_location",
  "machine_removed_from_location",
  "machine_replaced",
] as const;

/**
 * Everything that changed in a date range:
 *  - locations added (locations.created_at) and closed (locations.close_date)
 *  - machine placements from the audit log (added / removed / replaced)
 *  - new machines registered into inventory (machines.created_at)
 *
 * Table columns are the source of truth for added/closed/new so seeded rows
 * that predate audit logging still show up; placement history only exists
 * in the audit log.
 */
export function useChanges(startDate: string, endDate: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["changes", startDate, endDate],
    enabled: Boolean(startDate && endDate && startDate <= endDate),
    queryFn: async () => {
      // Local-day boundaries converted to UTC for timestamptz columns.
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();

      const [addedRes, closedRes, eventsRes, machinesRes] = await Promise.all([
        supabase
          .from("locations")
          .select("id, location_number, name, city, state, created_at")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false }),
        // close_date is a plain date column, so compare it to date strings.
        supabase
          .from("locations")
          .select("id, location_number, name, city, state, close_date")
          .not("close_date", "is", null)
          .gte("close_date", startDate)
          .lte("close_date", endDate)
          .order("close_date", { ascending: false }),
        supabase
          .from("audit_log")
          .select(
            "*, locations:location_id(location_number, name, state), machines:machine_id(machine_type, cabinet_type, serial_number)"
          )
          .in("action", [...MACHINE_CHANGE_ACTIONS])
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("machines")
          .select(
            "id, machine_type, cabinet_type, serial_number, created_at, location_id, locations:location_id(location_number, name)"
          )
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false }),
      ]);

      const firstError =
        addedRes.error ?? closedRes.error ?? eventsRes.error ?? machinesRes.error;
      if (firstError) throw firstError;

      const locationChanges: LocationChangeRow[] = [
        ...(addedRes.data ?? []).map((l) => ({
          id: `${l.id}-added`,
          location_number: l.location_number as string,
          name: l.name as string,
          city: l.city as string,
          state: l.state as "VA" | "TX",
          change: "added" as const,
          sortKey: l.created_at as string,
          dateDisplay: new Date(l.created_at as string).toLocaleDateString(),
        })),
        ...(closedRes.data ?? []).map((l) => ({
          id: `${l.id}-closed`,
          location_number: l.location_number as string,
          name: l.name as string,
          city: l.city as string,
          state: l.state as "VA" | "TX",
          change: "closed" as const,
          sortKey: l.close_date as string,
          // close_date is a business date (YYYY-MM-DD); show it verbatim to
          // avoid timezone shifting it a day when parsed as UTC midnight.
          dateDisplay: l.close_date as string,
        })),
      ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

      return {
        locationChanges,
        machineChanges: (eventsRes.data ?? []) as MachineChangeRow[],
        newMachines: (machinesRes.data ?? []) as unknown as NewInventoryRow[],
      };
    },
  });
}
