import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { InventoryClient } from "@/components/machines/inventory-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const { data: machines } = await supabase
    .from("machines")
    .select("*")
    .is("location_id", null)
    .order("machine_type");

  const { data: dispensers } = await supabase
    .from("dispensers")
    .select("*")
    .is("location_id", null)
    .order("serial_number");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Machines and dispensers available for deployment
          </p>
        </div>
        {isAdmin && (
          <Link href="/inventory/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Register New
            </Button>
          </Link>
        )}
      </div>

      <InventoryClient
        machines={machines ?? []}
        dispensers={dispensers ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
