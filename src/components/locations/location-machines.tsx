"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowLeftRight, Minus, Package, MoreVertical } from "lucide-react";
import {
  addMachineToLocation,
  removeMachineFromLocation,
  replaceMachine,
} from "@/actions/machine-actions";
import { addDispenserToLocation } from "@/actions/dispenser-actions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Machine, Dispenser } from "@/types/database";
import Link from "next/link";

interface LocationMachinesProps {
  locationId: string;
  machines: Machine[];
  inventoryMachines: Machine[];
  inventoryDispensers: Dispenser[];
  dispenser: Dispenser | null;
  isAdmin: boolean;
  isClosed: boolean;
}

export function LocationMachines({
  locationId,
  machines,
  inventoryMachines,
  inventoryDispensers,
  dispenser,
  isAdmin,
  isClosed,
}: LocationMachinesProps) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Machines ({machines.length})
          </CardTitle>
          {isAdmin && !isClosed && (
            <div className="flex gap-2">
              {!dispenser && inventoryDispensers.length > 0 && (
                <AddDispenserDialog
                  locationId={locationId}
                  inventoryDispensers={inventoryDispensers}
                />
              )}
              <AddMachineDialog
                locationId={locationId}
                inventoryMachines={inventoryMachines}
                occupiedPositions={machines
                  .map((m) => m.position_at_location)
                  .filter(Boolean) as number[]}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {machines.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No machines at this location
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pos</TableHead>
                    <TableHead>Machine Type</TableHead>
                    <TableHead>Cabinet</TableHead>
                    <TableHead>Serial #</TableHead>
                    {isAdmin && !isClosed && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((machine) => (
                    <TableRow
                      key={machine.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/machines/${machine.id}?edit=true`)}
                    >
                      <TableCell>
                        <Badge variant="outline">
                          {machine.position_at_location || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-primary">
                        {machine.machine_type}
                      </TableCell>
                      <TableCell>{machine.cabinet_type}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {machine.serial_number ?? "—"}
                      </TableCell>
                      {isAdmin && !isClosed && (
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <MachineActionsMenu
                              machine={machine}
                              locationId={locationId}
                              inventoryMachines={inventoryMachines}
                            />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {machines.map((machine) => (
                <div
                  key={machine.id}
                  className="rounded-lg border p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => router.push(`/machines/${machine.id}?edit=true`)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Pos {machine.position_at_location || "-"}
                        </Badge>
                        <span className="font-medium text-primary">
                          {machine.machine_type}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {machine.cabinet_type}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">
                        SN: {machine.serial_number ?? "—"}
                      </p>
                    </div>
                    {isAdmin && !isClosed && (
                      <MachineActionsMenu
                        machine={machine}
                        locationId={locationId}
                        inventoryMachines={inventoryMachines}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AddMachineDialog({
  locationId,
  inventoryMachines,
  occupiedPositions,
}: {
  locationId: string;
  inventoryMachines: Machine[];
  occupiedPositions: number[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState("");
  const [position, setPosition] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const availablePositions = Array.from({ length: 9 }, (_, i) => i + 1).filter(
    (p) => !occupiedPositions.includes(p)
  );

  const filteredInventory = inventoryMachines.filter(
    (m) =>
      m.machine_type.toLowerCase().includes(search.toLowerCase()) ||
      (m.serial_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd() {
    if (!selectedMachine || !position) return;
    setLoading(true);
    const result = await addMachineToLocation(
      selectedMachine,
      locationId,
      Number(position),
      notes || undefined
    );
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Machine added to location");
      setOpen(false);
      setSelectedMachine("");
      setPosition("");
      setNotes("");
      queryClient.invalidateQueries();
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        Add Machine
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Machine from Inventory</DialogTitle>
          <DialogDescription>
            Select a machine from inventory to deploy at this location.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Position</Label>
            <Select value={position} onValueChange={(v) => v && setPosition(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {availablePositions.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    Position {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Machine</Label>
            <Input
              placeholder="Search inventory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto border rounded-md">
              {filteredInventory.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No machines in inventory
                </p>
              ) : (
                filteredInventory.map((m) => (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0 ${
                      selectedMachine === m.id ? "bg-primary/10" : ""
                    }`}
                    onClick={() => setSelectedMachine(m.id)}
                  >
                    <span className="font-medium">{m.machine_type}</span>
                    <span className="text-muted-foreground ml-2">
                      ({m.cabinet_type})
                    </span>
                    <span className="text-xs font-mono ml-2">
                      {m.serial_number ?? "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedMachine || !position || loading}
          >
            {loading ? "Adding..." : "Add Machine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MachineActionsMenu({
  machine,
  locationId,
  inventoryMachines,
}: {
  machine: Machine;
  locationId: string;
  inventoryMachines: Machine[];
}) {
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    // stopPropagation here prevents opening the dropdown (or clicking a menu
    // item) from triggering the parent row's navigate-to-edit handler.
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" title="Actions" />}
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setReplaceOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" />
            Replace
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Minus className="h-4 w-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReplaceMachineDialog
        machine={machine}
        locationId={locationId}
        inventoryMachines={inventoryMachines}
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
      />
      <RemoveMachineDialog
        machine={machine}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
      />
    </div>
  );
}

function RemoveMachineDialog({
  machine,
  open,
  onOpenChange,
}: {
  machine: Machine;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  const controlled = open !== undefined;

  async function handleRemove() {
    setLoading(true);
    const result = await removeMachineFromLocation(
      machine.id,
      notes || undefined
    );
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Machine returned to inventory");
      queryClient.invalidateQueries();
    }
    setLoading(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {!controlled && (
        <AlertDialogTrigger render={<Button variant="ghost" size="icon" title="Remove" />}>
          <Minus className="h-4 w-4" />
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Machine</AlertDialogTitle>
          <AlertDialogDescription>
            This will move {machine.machine_type}
            {machine.serial_number ? ` (SN: ${machine.serial_number})` : ""}
            {" "}back to inventory.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for removal..."
            className="mt-2"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRemove} disabled={loading}>
            {loading ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReplaceMachineDialog({
  machine,
  locationId,
  inventoryMachines,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  machine: Machine;
  locationId: string;
  inventoryMachines: Machine[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;
  const [selectedReplacement, setSelectedReplacement] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const filteredInventory = inventoryMachines.filter(
    (m) =>
      m.machine_type.toLowerCase().includes(search.toLowerCase()) ||
      (m.serial_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleReplace() {
    if (!selectedReplacement) return;
    setLoading(true);
    const result = await replaceMachine(
      machine.id,
      selectedReplacement,
      locationId,
      notes || undefined
    );
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Machine replaced successfully");
      setOpen(false);
      setSelectedReplacement("");
      setNotes("");
      queryClient.invalidateQueries();
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger render={<Button variant="ghost" size="icon" title="Replace" />}>
          <ArrowLeftRight className="h-4 w-4" />
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace Machine</DialogTitle>
          <DialogDescription>
            Replace {machine.machine_type}
            {machine.serial_number ? ` (SN: ${machine.serial_number})` : ""} at
            position {machine.position_at_location} with a machine from
            inventory. The current machine will be returned to inventory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Replacement</Label>
            <Input
              placeholder="Search inventory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto border rounded-md">
              {filteredInventory.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No machines in inventory
                </p>
              ) : (
                filteredInventory.map((m) => (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0 ${
                      selectedReplacement === m.id ? "bg-primary/10" : ""
                    }`}
                    onClick={() => setSelectedReplacement(m.id)}
                  >
                    <span className="font-medium">{m.machine_type}</span>
                    <span className="text-muted-foreground ml-2">
                      ({m.cabinet_type})
                    </span>
                    <span className="text-xs font-mono ml-2">
                      {m.serial_number ?? "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for replacement..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleReplace}
            disabled={!selectedReplacement || loading}
          >
            {loading ? "Replacing..." : "Replace Machine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDispenserDialog({
  locationId,
  inventoryDispensers,
}: {
  locationId: string;
  inventoryDispensers: Dispenser[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function handleAdd() {
    if (!selected) return;
    setLoading(true);
    const result = await addDispenserToLocation(selected, locationId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Dispenser added to location");
      setOpen(false);
      queryClient.invalidateQueries();
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Package className="mr-2 h-4 w-4" />
        Add Dispenser
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Dispenser</DialogTitle>
          <DialogDescription>
            Select a dispenser from inventory to assign to this location.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="max-h-48 overflow-y-auto border rounded-md">
            {inventoryDispensers.map((d) => (
              <button
                key={d.id}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0 ${
                  selected === d.id ? "bg-primary/10" : ""
                }`}
                onClick={() => setSelected(d.id)}
              >
                <span className="font-medium">
                  {d.serial_number || "No serial #"}
                </span>
                <span className="text-muted-foreground ml-2">
                  Cash: ${Number(d.dispenser_cash).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selected || loading}>
            {loading ? "Adding..." : "Add Dispenser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
