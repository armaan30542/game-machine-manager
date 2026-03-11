"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createLocation(formData: {
  location_number: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  county?: string;
  state: "VA" | "TX";
  zipcode: string;
  phone?: string;
  email?: string;
  contact_name?: string;
  contact_phone?: string;
  has_contract: boolean;
  percentage_share: number;
  fees: number;
  revenue_url?: string;
  comments?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("locations")
    .insert(formData)
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "location_created",
    performed_by: user.id,
    location_id: data.id,
    details: { location_number: formData.location_number },
  });

  revalidatePath("/locations");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateLocation(
  locationId: string,
  formData: Record<string, unknown>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("locations")
    .update(formData)
    .eq("id", locationId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "location_edited",
    performed_by: user.id,
    location_id: locationId,
    details: { updated_fields: Object.keys(formData) },
  });

  revalidatePath("/locations");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function closeLocation(
  locationId: string,
  closeDate: string,
  notes?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("close_location", {
    p_location_id: locationId,
    p_user_id: user.id,
    p_close_date: closeDate,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/locations");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function reopenLocation(locationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("locations")
    .update({ close_date: null })
    .eq("id", locationId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    action: "location_reopened",
    performed_by: user.id,
    location_id: locationId,
  });

  revalidatePath("/locations");
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
