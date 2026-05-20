"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createMachine, updateMachine } from "@/actions/machine-actions";
import { toast } from "sonner";
import { useMachineTypes } from "@/hooks/use-machine-types";
import { useCabinetTypes } from "@/hooks/use-cabinet-types";
import type { Machine } from "@/types/database";
import { MachinePhoto } from "@/components/machines/machine-photo";

interface MachineFormProps {
  machine?: Machine;
}

export function MachineForm({ machine }: MachineFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!machine;
  const [loading, setLoading] = useState(false);
  const { data: machineTypes = [] } = useMachineTypes();
  const { data: cabinetTypes = [] } = useCabinetTypes();

  const [form, setForm] = useState({
    machine_type: machine?.machine_type ?? "",
    cabinet_type: machine?.cabinet_type ?? "",
    serial_number: machine?.serial_number ?? "",
    notes: machine?.notes ?? "",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (isEdit) {
      const result = await updateMachine(machine!.id, {
        machine_type: form.machine_type.trim(),
        cabinet_type: form.cabinet_type.trim(),
        serial_number: form.serial_number.trim() || null,
        notes: form.notes || null,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Machine updated");
        queryClient.invalidateQueries();
        router.push(`/machines/${machine!.id}`);
      }
    } else {
      const result = await createMachine({
        machine_type: form.machine_type.trim(),
        cabinet_type: form.cabinet_type.trim(),
        serial_number: form.serial_number.trim() || null,
        notes: form.notes || undefined,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Machine registered to inventory");
        queryClient.invalidateQueries();
        router.push("/inventory");
      }
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Machine Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="machine_type">Machine Type *</Label>
            <Input
              id="machine_type"
              list="machine-type-options"
              value={form.machine_type}
              onChange={(e) => updateField("machine_type", e.target.value)}
              placeholder="Pick an existing type or type a new one"
              autoComplete="off"
            />
            <datalist id="machine-type-options">
              {machineTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Not in the list? Just type the new type - it will be saved.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cabinet_type">Cabinet Type *</Label>
            <Input
              id="cabinet_type"
              list="cabinet-type-options"
              value={form.cabinet_type}
              onChange={(e) => updateField("cabinet_type", e.target.value)}
              placeholder="Pick an existing cabinet or type a new one"
              autoComplete="off"
            />
            <datalist id="cabinet-type-options">
              {cabinetTypes.map((ct) => (
                <option key={ct} value={ct} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Not in the list? Just type the new cabinet - it will be saved.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial_number">Serial / Asset Tag Number</Label>
            <Input
              id="serial_number"
              value={form.serial_number}
              onChange={(e) => updateField("serial_number", e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Any additional notes..."
            />
          </div>
        </CardContent>
      </Card>

      {isEdit && machine && (
        <Card>
          <CardHeader>
            <CardTitle>Photo</CardTitle>
          </CardHeader>
          <CardContent>
            <MachinePhoto machineId={machine.id} photoPath={machine.photo_path} />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            loading || !form.machine_type.trim() || !form.cabinet_type.trim()
          }
        >
          {loading
            ? isEdit
              ? "Saving..."
              : "Registering..."
            : isEdit
              ? "Save Changes"
              : "Register Machine"}
        </Button>
      </div>
    </form>
  );
}
