"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getNextLocationNumber(state: "VA" | "TX") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", number: "" };

  const { data: locations } = await supabase
    .from("locations")
    .select("location_number")
    .ilike("location_number", `${state}%`);

  let maxSeq = 0;
  for (const loc of locations || []) {
    const match = loc.location_number.match(/(\d+)$/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  const next = String(maxSeq + 1).padStart(3, "0");
  return { number: `${state}-${next}` };
}

export async function createLocation(formData: {
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

  // Auto-generate location number with retry on unique violation
  let locationNumber = "";
  let data: { id: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await getNextLocationNumber(formData.state);
    if (result.error) return { error: result.error };
    locationNumber = result.number;

    const insertResult = await supabase
      .from("locations")
      .insert({ ...formData, location_number: locationNumber })
      .select("id")
      .single();

    if (!insertResult.error) {
      data = insertResult.data;
      break;
    }
    if (!insertResult.error.message.includes("unique") && !insertResult.error.message.includes("duplicate")) {
      return { error: insertResult.error.message };
    }
  }

  if (!data) return { error: "Failed to generate unique location number" };

  await supabase.from("audit_log").insert({
    action: "location_created",
    performed_by: user.id,
    location_id: data.id,
    details: { location_number: locationNumber },
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
