/**
 * Month-end snapshots and the diff between two of them.
 * Pure functions: used by the daily job (to build a snapshot) and by the
 * Monthly Changes page (to compare two).
 */

export interface SnapshotLocation {
  id: string;
  location_number: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  county: string | null;
  state: string;
  zipcode: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  has_contract: boolean;
  percentage_share: number;
  fees: number;
  revenue_url: string | null;
  comments: string | null;
  close_date: string | null;
}

export interface SnapshotMachine {
  id: string;
  machine_type: string;
  cabinet_type: string;
  serial_number: string | null;
  location_id: string | null;
  position_at_location: number | null;
  notes: string | null;
}

export interface SnapshotDispenser {
  id: string;
  serial_number: string | null;
  location_id: string | null;
  dispenser_cash: number | null;
}

export interface SnapshotData {
  locations: SnapshotLocation[];
  machines: SnapshotMachine[];
  dispensers: SnapshotDispenser[];
}

export const LOCATION_SNAPSHOT_COLUMNS =
  "id, location_number, name, address_line1, address_line2, city, county, state, zipcode, phone, email, contact_name, contact_phone, has_contract, percentage_share, fees, revenue_url, comments, close_date";
export const MACHINE_SNAPSHOT_COLUMNS =
  "id, machine_type, cabinet_type, serial_number, location_id, position_at_location, notes";
export const DISPENSER_SNAPSHOT_COLUMNS =
  "id, serial_number, location_id, dispenser_cash";

export interface FieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface LocationChange {
  id: string;
  location_number: string;
  name: string;
  state: string;
  kind: "added" | "closed" | "reopened" | "removed" | "edited";
  fields: FieldChange[];
}

export interface MachineChange {
  id: string;
  machine: string;
  kind: "new" | "deleted" | "placed" | "removed" | "moved" | "edited";
  from: string;
  to: string;
  state: string;
  fields: FieldChange[];
}

export interface DispenserChange {
  id: string;
  dispenser: string;
  kind: "new" | "deleted" | "placed" | "removed" | "moved";
  from: string;
  to: string;
  state: string;
}

export interface SnapshotDiff {
  locations: LocationChange[];
  machines: MachineChange[];
  dispensers: DispenserChange[];
  counts: {
    locationsBefore: number;
    locationsAfter: number;
    deployedBefore: number;
    deployedAfter: number;
    inventoryBefore: number;
    inventoryAfter: number;
  };
}

const LOCATION_FIELDS: [keyof SnapshotLocation, string][] = [
  ["location_number", "Location #"],
  ["name", "Name"],
  ["address_line1", "Address"],
  ["address_line2", "Address line 2"],
  ["city", "City"],
  ["county", "County"],
  ["state", "State"],
  ["zipcode", "Zipcode"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["contact_name", "Contact"],
  ["contact_phone", "Contact phone"],
  ["has_contract", "Has contract"],
  ["percentage_share", "% share"],
  ["fees", "Fees"],
  ["revenue_url", "Revenue URL"],
  ["comments", "Comments"],
];

const MACHINE_FIELDS: [keyof SnapshotMachine, string][] = [
  ["machine_type", "Machine type"],
  ["cabinet_type", "Cabinet"],
  ["serial_number", "Serial number"],
  ["position_at_location", "Position"],
  ["notes", "Notes"],
];

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(blank)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function same(a: unknown, b: unknown): boolean {
  const blank = (v: unknown) => v === null || v === undefined || v === "";
  if (blank(a) && blank(b)) return true;
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function fieldChanges<T>(
  before: T,
  after: T,
  fields: [keyof T, string][]
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, label] of fields) {
    if (!same(before[field], after[field])) {
      out.push({
        field: String(field),
        label,
        before: show(before[field]),
        after: show(after[field]),
      });
    }
  }
  return out;
}

/** Everything that differs between an earlier and a later snapshot. */
export function diffSnapshots(
  before: SnapshotData,
  after: SnapshotData
): SnapshotDiff {
  const locBefore = new Map(before.locations.map((l) => [l.id, l]));
  const locAfter = new Map(after.locations.map((l) => [l.id, l]));
  const locName = (id: string | null): string => {
    if (!id) return "Inventory";
    const l = locAfter.get(id) ?? locBefore.get(id);
    return l ? `${l.location_number} - ${l.name}` : "Unknown location";
  };
  const locState = (id: string | null): string => {
    if (!id) return "";
    return (locAfter.get(id) ?? locBefore.get(id))?.state ?? "";
  };

  const locations: LocationChange[] = [];
  for (const l of after.locations) {
    const b = locBefore.get(l.id);
    const base = {
      id: l.id,
      location_number: l.location_number,
      name: l.name,
      state: l.state,
    };
    if (!b) {
      locations.push({ ...base, kind: "added", fields: [] });
      if (l.close_date) locations.push({ ...base, kind: "closed", fields: [] });
      continue;
    }
    if (!b.close_date && l.close_date) {
      locations.push({ ...base, kind: "closed", fields: [] });
    } else if (b.close_date && !l.close_date) {
      locations.push({ ...base, kind: "reopened", fields: [] });
    }
    const fields = fieldChanges(b, l, LOCATION_FIELDS);
    if (fields.length) locations.push({ ...base, kind: "edited", fields });
  }
  for (const b of before.locations) {
    if (!locAfter.has(b.id)) {
      locations.push({
        id: b.id,
        location_number: b.location_number,
        name: b.name,
        state: b.state,
        kind: "removed",
        fields: [],
      });
    }
  }

  const machBefore = new Map(before.machines.map((m) => [m.id, m]));
  const machAfter = new Map(after.machines.map((m) => [m.id, m]));
  const machName = (m: SnapshotMachine) =>
    `${m.machine_type} (${m.serial_number || "no SN"})`;

  const machines: MachineChange[] = [];
  for (const m of after.machines) {
    const b = machBefore.get(m.id);
    if (!b) {
      machines.push({
        id: m.id,
        machine: machName(m),
        kind: "new",
        from: "",
        to: locName(m.location_id),
        state: locState(m.location_id),
        fields: [],
      });
      continue;
    }
    if ((b.location_id ?? null) !== (m.location_id ?? null)) {
      machines.push({
        id: m.id,
        machine: machName(m),
        kind: !b.location_id ? "placed" : !m.location_id ? "removed" : "moved",
        from: locName(b.location_id),
        to: locName(m.location_id),
        state: locState(m.location_id) || locState(b.location_id),
        fields: [],
      });
    }
    const fields = fieldChanges(b, m, MACHINE_FIELDS);
    if (fields.length) {
      machines.push({
        id: m.id,
        machine: machName(m),
        kind: "edited",
        from: locName(m.location_id),
        to: locName(m.location_id),
        state: locState(m.location_id),
        fields,
      });
    }
  }
  for (const b of before.machines) {
    if (!machAfter.has(b.id)) {
      machines.push({
        id: b.id,
        machine: machName(b),
        kind: "deleted",
        from: locName(b.location_id),
        to: "",
        state: locState(b.location_id),
        fields: [],
      });
    }
  }

  const dispBefore = new Map(before.dispensers.map((d) => [d.id, d]));
  const dispAfter = new Map(after.dispensers.map((d) => [d.id, d]));
  const dispName = (d: SnapshotDispenser) =>
    `Dispenser ${d.serial_number || "(no SN)"}`;
  const dispensers: DispenserChange[] = [];
  for (const d of after.dispensers) {
    const b = dispBefore.get(d.id);
    if (!b) {
      dispensers.push({
        id: d.id,
        dispenser: dispName(d),
        kind: "new",
        from: "",
        to: locName(d.location_id),
        state: locState(d.location_id),
      });
    } else if ((b.location_id ?? null) !== (d.location_id ?? null)) {
      dispensers.push({
        id: d.id,
        dispenser: dispName(d),
        kind: !b.location_id ? "placed" : !d.location_id ? "removed" : "moved",
        from: locName(b.location_id),
        to: locName(d.location_id),
        state: locState(d.location_id) || locState(b.location_id),
      });
    }
  }
  for (const b of before.dispensers) {
    if (!dispAfter.has(b.id)) {
      dispensers.push({
        id: b.id,
        dispenser: dispName(b),
        kind: "deleted",
        from: locName(b.location_id),
        to: "",
        state: locState(b.location_id),
      });
    }
  }

  const active = (s: SnapshotData) =>
    s.locations.filter((l) => !l.close_date).length;
  const deployed = (s: SnapshotData) =>
    s.machines.filter((m) => m.location_id).length;
  const inventory = (s: SnapshotData) =>
    s.machines.filter((m) => !m.location_id).length;

  return {
    locations,
    machines,
    dispensers,
    counts: {
      locationsBefore: active(before),
      locationsAfter: active(after),
      deployedBefore: deployed(before),
      deployedAfter: deployed(after),
      inventoryBefore: inventory(before),
      inventoryAfter: inventory(after),
    },
  };
}

/** 'YYYY-MM' for the month before the given 'YYYY-MM'. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** "November 2026" for '2026-11'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
