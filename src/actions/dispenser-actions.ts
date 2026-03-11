"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createDispenser(formData: {
  serial_number?: string;
  location_id?: string;
  dispenser_cash?: number;
  notes?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("dispensers")
    .insert({
      serial_number: formData.serial_number || null,
      location_id: formData.location_id || null,
      dispenser_cash: formData.dispenser_cash || 0,
      notes: formData.notes || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "dispenser_added",
    performed_by: user.id,
    location_id: formData.location_id || null,
    dispenser_id: data.id,
  });

  revalidatePath("/inventory");
  if (formData.location_id) revalidatePath(`/locations/${formData.location_id}`);
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function addDispenserToLocation(
  dispenserId: string,
  locationId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("dispensers")
    .update({ location_id: locationId })
    .eq("id", dispenserId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "dispenser_added",
    performed_by: user.id,
    location_id: locationId,
    dispenser_id: dispenserId,
  });

  revalidatePath("/inventory");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function removeDispenserFromLocation(dispenserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: dispenser } = await supabase
    .from("dispensers")
    .select("location_id")
    .eq("id", dispenserId)
    .single();

  const { error } = await supabase
    .from("dispensers")
    .update({ location_id: null })
    .eq("id", dispenserId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "dispenser_removed",
    performed_by: user.id,
    location_id: dispenser?.location_id,
    dispenser_id: dispenserId,
  });

  revalidatePath("/inventory");
  if (dispenser?.location_id)
    revalidatePath(`/locations/${dispenser.location_id}`);
  revalidatePath("/dashboard");
  return { success: true };
}
