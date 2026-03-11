import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LocationForm } from "@/components/locations/location-form";
import Link from "next/link";

export default async function NewLocationPage() {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (profile?.role !== "admin") redirect("/locations");

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/locations"
            className="text-sm text-muted-foreground hover:underline"
          >
            Locations
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">New</span>
        </div>
        <h1 className="text-2xl font-bold">Add New Location</h1>
      </div>
      <LocationForm />
    </div>
  );
}
