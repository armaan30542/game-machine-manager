import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MachineForm } from "@/components/machines/machine-form";
import Link from "next/link";

export default async function NewMachinePage() {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (profile?.role !== "admin") redirect("/inventory");

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/inventory"
            className="text-sm text-muted-foreground hover:underline"
          >
            Inventory
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">Register New</span>
        </div>
        <h1 className="text-2xl font-bold">Register New Machine</h1>
        <p className="text-sm text-muted-foreground">
          Add a new machine to inventory
        </p>
      </div>
      <MachineForm />
    </div>
  );
}
