"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  Plus,
  Minus,
  ArrowLeftRight,
  XCircle,
  Edit,
  DollarSign,
  CalendarRange,
  Package,
} from "lucide-react";
import type { AuditLogEntry } from "@/types/database";

const ACTION_META: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  machine_added_to_location: {
    label: "Machine Added",
    color: "bg-green-100 text-green-800",
    icon: Plus,
  },
  machine_removed_from_location: {
    label: "Machine Removed",
    color: "bg-orange-100 text-orange-800",
    icon: Minus,
  },
  machine_replaced: {
    label: "Machine Replaced",
    color: "bg-blue-100 text-blue-800",
    icon: ArrowLeftRight,
  },
  machine_created: {
    label: "Machine Created",
    color: "bg-green-100 text-green-800",
    icon: Plus,
  },
  machine_edited: {
    label: "Machine Edited",
    color: "bg-gray-100 text-gray-800",
    icon: Edit,
  },
  machine_deleted: {
    label: "Machine Deleted",
    color: "bg-red-100 text-red-800",
    icon: XCircle,
  },
  location_created: {
    label: "Location Created",
    color: "bg-green-100 text-green-800",
    icon: Plus,
  },
  location_edited: {
    label: "Location Edited",
    color: "bg-gray-100 text-gray-800",
    icon: Edit,
  },
  location_closed: {
    label: "Location Closed",
    color: "bg-red-100 text-red-800",
    icon: XCircle,
  },
  location_reopened: {
    label: "Location Reopened",
    color: "bg-green-100 text-green-800",
    icon: Plus,
  },
  dispenser_added: {
    label: "Dispenser Added",
    color: "bg-green-100 text-green-800",
    icon: Package,
  },
  dispenser_removed: {
    label: "Dispenser Removed",
    color: "bg-orange-100 text-orange-800",
    icon: Minus,
  },
  revenue_fetched: {
    label: "Revenue Fetched",
    color: "bg-purple-100 text-purple-800",
    icon: DollarSign,
  },
  revenue_by_date_run: {
    label: "Revenue by Date",
    color: "bg-purple-100 text-purple-800",
    icon: CalendarRange,
  },
};

interface ActivityClientProps {
  auditLog: AuditLogEntry[];
}

const PRESET_FILTERS: { label: string; actions: string[] | null }[] = [
  { label: "All", actions: null },
  {
    label: "Inventory Changes",
    actions: [
      "machine_created",
      "machine_deleted",
      "machine_added_to_location",
      "machine_removed_from_location",
      "machine_replaced",
    ],
  },
  {
    label: "Location Activity",
    actions: [
      "machine_added_to_location",
      "machine_removed_from_location",
      "machine_replaced",
      "location_created",
      "location_edited",
      "location_closed",
      "location_reopened",
    ],
  },
  { label: "Revenue", actions: ["revenue_fetched", "revenue_by_date_run"] },
];

export function ActivityClient({ auditLog }: ActivityClientProps) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [preset, setPreset] = useState(0);

  const activePreset = PRESET_FILTERS[preset];

  const filtered = auditLog.filter((entry) => {
    if (activePreset.actions && !activePreset.actions.includes(entry.action)) {
      return false;
    }

    const matchesAction =
      actionFilter === "all" || entry.action === actionFilter;

    const matchesSearch =
      search === "" ||
      (entry.locations as Record<string, string> | null)
        ?.name?.toLowerCase()
        .includes(search.toLowerCase()) ||
      (entry.machines as Record<string, string> | null)
        ?.machine_type?.toLowerCase()
        .includes(search.toLowerCase()) ||
      entry.notes?.toLowerCase().includes(search.toLowerCase());

    return matchesAction && matchesSearch;
  });

  const uniqueActions = [...new Set(
    (activePreset.actions
      ? auditLog.filter((e) => activePreset.actions!.includes(e.action))
      : auditLog
    ).map((e) => e.action)
  )];

  return (
    <div className="space-y-4">
      {/* Preset filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {PRESET_FILTERS.map((pf, i) => (
          <button
            key={pf.label}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              preset === i
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
            onClick={() => {
              setPreset(i);
              setActionFilter("all");
            }}
          >
            {pf.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by location, machine, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => v && setActionFilter(v)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Action Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map((action) => (
              <SelectItem key={action} value={action}>
                {ACTION_META[action]?.label || action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No activity found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => {
                const meta = ACTION_META[entry.action];
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={meta?.color || "bg-gray-100"}>
                        {meta?.label || entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(entry.locations as Record<string, string> | null)
                        ? `${(entry.locations as Record<string, string>).location_number} - ${(entry.locations as Record<string, string>).name}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(entry.machines as Record<string, string> | null)
                        ? `${(entry.machines as Record<string, string>).machine_type} (${(entry.machines as Record<string, string>).serial_number})`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(entry.profiles as Record<string, string | null> | null)
                        ? (entry.profiles as Record<string, string | null>).full_name ||
                          (entry.profiles as Record<string, string>).email
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {entry.notes || "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {filtered.map((entry) => {
          const meta = ACTION_META[entry.action];
          const Icon = meta?.icon || Edit;
          return (
            <Card key={entry.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 rounded-full p-1.5 ${meta?.color || "bg-gray-100"}`}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-sm">
                      {meta?.label || entry.action}
                    </p>
                    {(entry.locations as Record<string, string> | null) && (
                      <p className="text-xs text-muted-foreground">
                        {(entry.locations as Record<string, string>).location_number} -{" "}
                        {(entry.locations as Record<string, string>).name}
                      </p>
                    )}
                    {(entry.machines as Record<string, string> | null) && (
                      <p className="text-xs text-muted-foreground">
                        {(entry.machines as Record<string, string>).machine_type}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        {entry.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {auditLog.length} entries
      </p>
    </div>
  );
}
