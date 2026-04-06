"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Trash2 } from "lucide-react";
import { deleteMachine } from "@/actions/machine-actions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Machine, Dispenser } from "@/types/database";
import { CABINET_TYPES } from "@/lib/constants";

interface InventoryClientProps {
  machines: Machine[];
  dispensers: Dispenser[];
  isAdmin: boolean;
}

export function InventoryClient({
  machines,
  dispensers,
  isAdmin,
}: InventoryClientProps) {
  const [search, setSearch] = useState("");
  const [cabinetFilter, setCabinetFilter] = useState<string>("all");

  const filteredMachines = machines.filter((m) => {
    const matchesSearch =
      search === "" ||
      m.machine_type.toLowerCase().includes(search.toLowerCase()) ||
      m.serial_number.toLowerCase().includes(search.toLowerCase());
    const matchesCabinet =
      cabinetFilter === "all" || m.cabinet_type === cabinetFilter;
    return matchesSearch && matchesCabinet;
  });

  return (
    <Tabs defaultValue="machines">
      <TabsList>
        <TabsTrigger value="machines">
          Machines ({machines.length})
        </TabsTrigger>
        <TabsTrigger value="dispensers">
          Dispensers ({dispensers.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="machines" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by type or serial number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={cabinetFilter} onValueChange={(v) => v && setCabinetFilter(v)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Cabinet Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cabinets</SelectItem>
              {CABINET_TYPES.map((ct) => (
                <SelectItem key={ct} value={ct}>
                  {ct}
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
                <TableHead>Machine Type</TableHead>
                <TableHead>Cabinet Type</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Notes</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMachines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No machines in inventory
                  </TableCell>
                </TableRow>
              ) : (
                filteredMachines.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        href={`/machines/${m.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {m.machine_type}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.cabinet_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.serial_number}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {m.notes || "-"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <DeleteMachineButton machineId={m.id} machineName={m.machine_type} />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile */}
        <div className="grid gap-3 md:hidden">
          {filteredMachines.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No machines in inventory
            </p>
          ) : (
            filteredMachines.map((m) => (
              <Link key={m.id} href={`/machines/${m.id}`}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-primary">
                          {m.machine_type}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {m.cabinet_type}
                        </Badge>
                        <p className="text-xs font-mono text-muted-foreground">
                          SN: {m.serial_number}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Showing {filteredMachines.length} of {machines.length} machines in
          inventory
        </p>
      </TabsContent>

      <TabsContent value="dispensers" className="space-y-4">
        {dispensers.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No dispensers in inventory
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Cash</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispensers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono">
                      {d.serial_number || "N/A"}
                    </TableCell>
                    <TableCell>
                      ${Number(d.dispenser_cash).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function DeleteMachineButton({
  machineId,
  machineName,
}: {
  machineId: string;
  machineName: string;
}) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function handleDelete() {
    setLoading(true);
    const result = await deleteMachine(machineId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Machine deleted");
      queryClient.invalidateQueries();
    }
    setLoading(false);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon" />}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Machine</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently delete {machineName}? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground"
          >
            {loading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
