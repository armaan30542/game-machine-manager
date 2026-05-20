export type UserRole = "admin" | "reporting";

export type AuditAction =
  | "machine_added_to_location"
  | "machine_removed_from_location"
  | "machine_replaced"
  | "machine_created"
  | "machine_edited"
  | "machine_deleted"
  | "location_created"
  | "location_edited"
  | "location_closed"
  | "location_reopened"
  | "dispenser_added"
  | "dispenser_removed"
  | "revenue_fetched"
  | "revenue_by_date_run";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  location_number: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  county: string | null;
  state: "VA" | "TX";
  zipcode: string;
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
  created_at: string;
  updated_at: string;
}

export interface LocationWithCounts extends Location {
  machines: { count: number }[];
  dispensers: { count: number }[];
}

export interface Machine {
  id: string;
  machine_type: string;
  cabinet_type: string;
  serial_number: string | null;
  location_id: string | null;
  position_at_location: number | null;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MachineWithLocation extends Machine {
  locations: Pick<Location, "id" | "location_number" | "name"> | null;
}

export interface Dispenser {
  id: string;
  serial_number: string | null;
  location_id: string | null;
  dispenser_cash: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueRecord {
  id: string;
  location_id: string;
  period_start: string;
  period_end: string;
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  fee_amount: number;
  company_share_pct: number;
  company_revenue: number;
  fetched_at: string;
  raw_data: unknown;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  performed_by: string | null;
  location_id: string | null;
  machine_id: string | null;
  dispenser_id: string | null;
  details: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  profiles?: Pick<Profile, "email" | "full_name"> | null;
  locations?: Pick<Location, "location_number" | "name"> | null;
  machines?: Pick<Machine, "machine_type" | "serial_number"> | null;
}

export interface MachineType {
  id: number;
  name: string;
  is_active: boolean;
}

export interface CabinetType {
  id: number;
  name: string;
  is_active: boolean;
}

export interface RevenueMachineLine {
  id: string;
  revenue_record_id: string;
  location_id: string;
  position: number | null;
  ksys_game_id: string | null;
  game_name: string;
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  last_read_date: string | null;
  created_at: string;
}
