"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Package,
  Warehouse,
  Zap,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { useDashboardData, type DeployedMachineRow } from "@/hooks/use-dashboard";

function formatAction(action: string): string {
  const map: Record<string, string> = {
    machine_added_to_location: "Machine added to location",
    machine_removed_from_location: "Machine removed from location",
    machine_replaced: "Machine replaced",
    machine_created: "New machine registered",
    machine_edited: "Machine edited",
    machine_deleted: "Machine deleted",
    location_created: "Location created",
    location_edited: "Location edited",
    location_closed: "Location closed",
    location_reopened: "Location reopened",
    dispenser_added: "Dispenser added",
    dispenser_removed: "Dispenser removed",
    revenue_fetched: "Revenue data fetched",
  };
  return map[action] || action;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-24 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-24 w-full" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

export function DashboardClient() {
  const { data, isLoading } = useDashboardData();

  if (isLoading || !data) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Active Locations
            </CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeLocations}</div>
            <p className="text-xs text-muted-foreground">
              {data.totalLocations} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Deployed Machines
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.deployedMachines}</div>
            <p className="text-xs text-muted-foreground">
              across {data.activeLocations} locations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inventory</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.inventoryMachines}</div>
            <p className="text-xs text-muted-foreground">
              machines available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Dispensers</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.deployedDispensers}</div>
            <p className="text-xs text-muted-foreground">
              deployed, {data.inventoryDispensers} in inventory
            </p>
          </CardContent>
        </Card>
      </div>

      {/* State breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Locations by State</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">VA</Badge>
                  <span className="text-sm">Virginia</span>
                </div>
                <span className="text-2xl font-bold">{data.vaCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">TX</Badge>
                  <span className="text-sm">Texas</span>
                </div>
                <span className="text-2xl font-bold">{data.txCount}</span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${
                      data.vaCount + data.txCount > 0
                        ? (data.vaCount / (data.vaCount + data.txCount)) * 100
                        : 50
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>VA: {data.vaCount}</span>
                <span>TX: {data.txCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No activity yet
              </p>
            ) : (
              <div className="space-y-3">
                {data.recentActivity.map((entry: Record<string, unknown>) => (
                  <div
                    key={entry.id as string}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {formatAction(entry.action as string)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(entry.locations as Record<string, string> | null)?.name &&
                          `at ${(entry.locations as Record<string, string>).name} `}
                        {new Date(
                          entry.created_at as string
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DeployedMachinesTable machines={data.deployedMachineList} />
    </div>
  );
}

type DepSortKey = "location" | "machine_type" | "cabinet_type" | "position";

function DeployedMachinesTable({
  machines,
}: {
  machines: DeployedMachineRow[];
}) {
  const [sortKey, setSortKey] = useState<DepSortKey>("location");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function sortValue(m: DeployedMachineRow, key: DepSortKey): string | number {
    switch (key) {
      case "location":
        return m.locations?.location_number ?? "";
      case "machine_type":
        return m.machine_type;
      case "cabinet_type":
        return m.cabinet_type;
      case "position":
        return m.position_at_location ?? 0;
    }
  }

  const sorted = [...machines].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(key: DepSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: DepSortKey }) {
    if (sortKey !== col)
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployed Machines ({machines.length})</CardTitle>
        <CardDescription>
          All machines currently placed at a location
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {(
                  [
                    ["location", "Location"],
                    ["machine_type", "Machine Type"],
                    ["cabinet_type", "Cabinet"],
                    ["position", "Position"],
                  ] as [DepSortKey, string][]
                ).map(([key, label]) => (
                  <TableHead
                    key={key}
                    className="cursor-pointer select-none hover:bg-muted/50"
                    onClick={() => handleSort(key)}
                  >
                    <span className="inline-flex items-center">
                      {label}
                      <SortIcon col={key} />
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No deployed machines
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.locations
                        ? `${m.locations.location_number} - ${m.locations.name}`
                        : "-"}
                    </TableCell>
                    <TableCell>{m.machine_type}</TableCell>
                    <TableCell>{m.cabinet_type}</TableCell>
                    <TableCell>{m.position_at_location ?? "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
