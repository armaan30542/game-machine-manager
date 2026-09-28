"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, ArrowLeftRight, PackagePlus } from "lucide-react";
import {
  useChanges,
  type MachineChangeRow,
  type NewInventoryRow,
} from "@/hooks/use-changes";

/** YYYY-MM-DD for a Date, using local calendar parts. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MACHINE_ACTION_META: Record<string, { label: string; color: string }> = {
  machine_added_to_location: {
    label: "Added",
    color: "bg-green-100 text-green-800",
  },
  machine_removed_from_location: {
    label: "Removed",
    color: "bg-orange-100 text-orange-800",
  },
  machine_replaced: {
    label: "Replaced",
    color: "bg-blue-100 text-blue-800",
  },
};

type StateFilter = "all" | "VA" | "TX";

function StateSelect({
  value,
  onChange,
}: {
  value: StateFilter;
  onChange: (v: StateFilter) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as StateFilter)}>
      <SelectTrigger className="w-full sm:w-[130px]">
        <SelectValue placeholder="State" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All States</SelectItem>
        <SelectItem value="VA">Virginia</SelectItem>
        <SelectItem value="TX">Texas</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ChangesClient() {
  const now = new Date();
  const [startDate, setStartDate] = useState(() =>
    isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(() => isoDate(now));

  const [locState, setLocState] = useState<StateFilter>("all");
  const [locChange, setLocChange] = useState<"all" | "added" | "closed">("all");
  const [machState, setMachState] = useState<StateFilter>("all");
  const [machChange, setMachChange] = useState<string>("all");

  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const { data, isLoading } = useChanges(startDate, endDate);

  const locationRows = (data?.locationChanges ?? []).filter((r) => {
    if (locState !== "all" && r.state !== locState) return false;
    if (locChange !== "all" && r.change !== locChange) return false;
    return true;
  });

  const machineRows = (data?.machineChanges ?? []).filter((e) => {
    if (machChange !== "all" && e.action !== machChange) return false;
    if (machState !== "all" && e.locations?.state !== machState) return false;
    return true;
  });

  const newMachines = data?.newMachines ?? [];

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:w-[160px]"
        />
        <span className="hidden text-sm text-muted-foreground sm:inline">
          to
        </span>
        <Input
          type="date"
          aria-label="End date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full sm:w-[160px]"
        />
        {!validRange && (
          <p className="text-sm text-red-600">
            Start date must be on or before end date.
          </p>
        )}
      </div>

      {isLoading && validRange ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {/* 1. Locations added / closed */}
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5" />
                  Locations Added &amp; Closed ({locationRows.length})
                </CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <StateSelect value={locState} onChange={setLocState} />
                  <Select
                    value={locChange}
                    onValueChange={(v) =>
                      v && setLocChange(v as "all" | "added" | "closed")
                    }
                  >
                    <SelectTrigger className="w-full sm:w-[130px]">
                      <SelectValue placeholder="Change" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Changes</SelectItem>
                      <SelectItem value="added">Added</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locationRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No location changes in this date range.
                        </TableCell>
                      </TableRow>
                    ) : (
                      locationRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.location_number} - {r.name}
                          </TableCell>
                          <TableCell className="text-sm">{r.city}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.state}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                r.change === "added"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }
                            >
                              {r.change === "added" ? "Added" : "Closed"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.dateDisplay}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 2. Machine changes at locations */}
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowLeftRight className="h-5 w-5" />
                  Machine Changes ({machineRows.length})
                </CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <StateSelect value={machState} onChange={setMachState} />
                  <Select
                    value={machChange}
                    onValueChange={(v) => v && setMachChange(v)}
                  >
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="Change" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Changes</SelectItem>
                      <SelectItem value="machine_added_to_location">
                        Added
                      </SelectItem>
                      <SelectItem value="machine_removed_from_location">
                        Removed
                      </SelectItem>
                      <SelectItem value="machine_replaced">Replaced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Machine</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machineRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No machine changes in this date range.
                        </TableCell>
                      </TableRow>
                    ) : (
                      machineRows.map((e) => (
                        <MachineChangeTableRow key={e.id} entry={e} />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 3. New machines in inventory */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <PackagePlus className="h-5 w-5" />
                New Machines Registered ({newMachines.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Machine Type</TableHead>
                      <TableHead>Cabinet</TableHead>
                      <TableHead>Serial #</TableHead>
                      <TableHead>Current Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newMachines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No machines were registered in this date range.
                        </TableCell>
                      </TableRow>
                    ) : (
                      newMachines.map((m) => (
                        <NewMachineTableRow key={m.id} machine={m} />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MachineChangeTableRow({ entry }: { entry: MachineChangeRow }) {
  const meta = MACHINE_ACTION_META[entry.action];
  const machine = entry.machines
    ? `${entry.machines.machine_type} (${entry.machines.serial_number ?? "no SN"})`
    : "Machine deleted";
  return (
    <TableRow>
      <TableCell className="text-sm whitespace-nowrap">
        {new Date(entry.created_at).toLocaleString()}
      </TableCell>
      <TableCell>
        <Badge className={meta?.color ?? "bg-gray-100"}>
          {meta?.label ?? entry.action}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">
        {/* For a replace, the audit row's machine is the incoming one. */}
        {entry.action === "machine_replaced" ? `New: ${machine}` : machine}
      </TableCell>
      <TableCell className="text-sm">
        {entry.locations
          ? `${entry.locations.location_number} - ${entry.locations.name}`
          : "—"}
      </TableCell>
      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
        {entry.notes || "—"}
      </TableCell>
    </TableRow>
  );
}

function NewMachineTableRow({ machine }: { machine: NewInventoryRow }) {
  return (
    <TableRow>
      <TableCell className="text-sm whitespace-nowrap">
        {new Date(machine.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="font-medium">{machine.machine_type}</TableCell>
      <TableCell className="text-sm">{machine.cabinet_type}</TableCell>
      <TableCell className="font-mono text-sm">
        {machine.serial_number ?? "—"}
      </TableCell>
      <TableCell>
        {machine.location_id ? (
          <Badge className="bg-blue-100 text-blue-800">
            Deployed
            {machine.locations ? ` - ${machine.locations.location_number}` : ""}
          </Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-800">In Inventory</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
