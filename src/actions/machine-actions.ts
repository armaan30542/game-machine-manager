"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createMachine(formData: {
  machine_type: string;
  cabinet_type: string;
  serial_number?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("machines")
    .insert({
      ...formData,
      serial_number: formData.serial_number || null,
      location_id: null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "machine_created",
    performed_by: user.id,
    machine_id: data.id,
    details: {
      machine_type: formData.machine_type,
      serial_number: formData.serial_number,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateMachine(
  machineId: string,
  formData: Record<string, unknown>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("machines")
    .update(formData)
    .eq("id", machineId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "machine_edited",
    performed_by: user.id,
    machine_id: machineId,
    details: { updated_fields: Object.keys(formData) },
  });

  revalidatePath("/inventory");
  revalidatePath("/machines");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function addMachineToLocation(
  machineId: string,
  locationId: string,
  position: number,
  notes?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("add_machine_to_location", {
    p_machine_id: machineId,
    p_location_id: locationId,
    p_position: position,
    p_user_id: user.id,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function removeMachineFromLocation(
  machineId: string,
  notes?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("remove_machine_from_location", {
    p_machine_id: machineId,
    p_user_id: user.id,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/locations");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function replaceMachine(
  deployedMachineId: string,
  inventoryMachineId: string,
  locationId: string,
  notes?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("replace_machine", {
    p_deployed_machine_id: deployedMachineId,
    p_inventory_machine_id: inventoryMachineId,
    p_location_id: locationId,
    p_user_id: user.id,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteMachine(machineId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Insert audit log BEFORE deleting (FK constraint on machine_id)
  await supabase.from("audit_log").insert({
    action: "machine_deleted",
    performed_by: user.id,
    machine_id: machineId,
  });

  const { error } = await supabase
    .from("machines")
    .delete()
    .eq("id", machineId);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}
