"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getCabinetTypes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cabinet_types")
    .select("name")
    .order("name");
  return data?.map((t) => t.name) ?? [];
}

export async function addCabinetType(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name cannot be empty" };

  const { error } = await supabase
    .from("cabinet_types")
    .insert({ name: trimmed });

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return { error: "This cabinet type already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteCabinetType(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { count } = await supabase
    .from("machines")
    .select("id", { count: "exact", head: true })
    .eq("cabinet_type", name);

  if (count && count > 0) {
    return {
      error: `Cannot delete: ${count} machine${count > 1 ? "s" : ""} use this cabinet`,
    };
  }

  const { error } = await supabase
    .from("cabinet_types")
    .delete()
    .eq("name", name);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/inventory");
  return { success: true };
}
