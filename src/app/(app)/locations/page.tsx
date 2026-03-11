import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { LocationsClient } from "@/components/locations/locations-client";

export default async function LocationsPage() {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  const { data: locations } = await supabase
    .from("locations")
    .select("*, machines(count), dispensers(count)")
    .order("location_number");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-sm text-muted-foreground">
            Manage all your store locations
          </p>
        </div>
        {profile?.role === "admin" && (
          <Link href="/locations/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Location
            </Button>
          </Link>
        )}
      </div>

      <LocationsClient locations={locations ?? []} />
    </div>
  );
}
