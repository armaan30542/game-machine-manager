/**
 * The audit-log actions people want to see: inventory, locations and money.
 *
 * Background bookkeeping (every revenue fetch, date-range runs, the nightly
 * and weekly jobs, failed reads) is still written to audit_log, but it is
 * left out of the Activity page and the dashboard. There are thousands of
 * those rows, and loading "the newest 200 of everything" used to crowd the
 * real activity out completely.
 */
export const INVENTORY_ACTIONS = [
  "machine_created",
  "machine_edited",
  "machine_deleted",
  "machine_added_to_location",
  "machine_removed_from_location",
  "machine_replaced",
  "dispenser_added",
  "dispenser_removed",
] as const;

export const LOCATION_ACTIONS = [
  "location_created",
  "location_edited",
  "location_closed",
  "location_reopened",
  "machine_added_to_location",
  "machine_removed_from_location",
  "machine_replaced",
] as const;

export const MONEY_ACTIONS = ["revenue_cleared", "settlement_estimated"] as const;

export const BUSINESS_ACTIONS: string[] = [
  ...new Set<string>([...INVENTORY_ACTIONS, ...LOCATION_ACTIONS, ...MONEY_ACTIONS]),
];
