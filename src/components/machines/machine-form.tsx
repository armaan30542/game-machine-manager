"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createMachine, updateMachine } from "@/actions/machine-actions";
import { toast } from "sonner";
import { CABINET_TYPES } from "@/lib/constants";
import { useMachineTypes } from "@/hooks/use-machine-types";
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
  const [machineSearch, setMachineSearch] = useState("");
  const { data: machineTypes = [] } = useMachineTypes();

  const [form, setForm] = useState({
    machine_type: machine?.machine_type ?? "",
    cabinet_type: machine?.cabinet_type ?? "",
    serial_number: machine?.serial_number ?? "",
    notes: machine?.notes ?? "",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const filteredTypes = machineTypes.filter((t) =>
    t.toLowerCase().includes(machineSearch.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (isEdit) {
      const result = await updateMachine(machine!.id, {
        machine_type: form.machine_type,
        cabinet_type: form.cabinet_type,
        serial_number: form.serial_number || null,
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
        machine_type: form.machine_type,
        cabinet_type: form.cabinet_type,
        serial_number: form.serial_number || undefined,
        notes: form.notes || undefined,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Machine registered to inventory");
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
            <Select
              value={form.machine_type}
              onValueChange={(v) => v && updateField("machine_type", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select machine type" />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 pb-2">
                  <Input
                    placeholder="Search types..."
                    value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                {filteredTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cabinet_type">Cabinet Type *</Label>
            <Select
              value={form.cabinet_type}
              onValueChange={(v) => v && updateField("cabinet_type", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select cabinet type" />
              </SelectTrigger>
              <SelectContent>
                {CABINET_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {ct}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            loading ||
            !form.machine_type ||
            !form.cabinet_type
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
