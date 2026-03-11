import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { LocationForm } from "@/components/locations/location-form";
import Link from "next/link";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (profile?.role !== "admin") redirect("/locations");

  const { data: location } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .single();

  if (!location) notFound();

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
          <Link
            href={`/locations/${id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {location.location_number}
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">Edit</span>
        </div>
        <h1 className="text-2xl font-bold">Edit {location.name}</h1>
      </div>
      <LocationForm location={location} />
    </div>
  );
}
