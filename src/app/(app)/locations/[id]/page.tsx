import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Phone,
  Mail,
  User,
  FileText,
  Edit,
  ExternalLink,
} from "lucide-react";
import { LocationMachines } from "@/components/locations/location-machines";
import { LocationActions } from "@/components/locations/location-actions";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: location } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .single();

  if (!location) notFound();

  const { data: machines } = await supabase
    .from("machines")
    .select("*")
    .eq("location_id", id)
    .order("position_at_location");

  const { data: dispenser } = await supabase
    .from("dispensers")
    .select("*")
    .eq("location_id", id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const { data: inventoryMachines } = isAdmin
    ? await supabase
        .from("machines")
        .select("*")
        .is("location_id", null)
        .order("machine_type")
    : { data: [] };

  const { data: inventoryDispensers } = isAdmin
    ? await supabase
        .from("dispensers")
        .select("*")
        .is("location_id", null)
        .order("serial_number")
    : { data: [] };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/locations"
              className="text-sm text-muted-foreground hover:underline"
            >
              Locations
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">
              {location.location_number}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{location.state}</Badge>
            {location.close_date ? (
              <Badge variant="destructive">
                Closed {location.close_date}
              </Badge>
            ) : (
              <Badge variant="default">Active</Badge>
            )}
            {location.has_contract && (
              <Badge variant="secondary">Contract</Badge>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <Link href={`/locations/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
            <LocationActions
              location={location}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </div>

      {/* Location info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Location Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
              <div>
                <p>{location.address_line1}</p>
                {location.address_line2 && <p>{location.address_line2}</p>}
                <p>
                  {location.city}
                  {location.county && `, ${location.county}`},{" "}
                  {location.state} {location.zipcode}
                </p>
              </div>
            </div>
            {location.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{location.phone}</span>
              </div>
            )}
            {location.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{location.email}</span>
              </div>
            )}
            {location.contact_name && (
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p>{location.contact_name}</p>
                  {location.contact_phone && (
                    <p className="text-sm text-muted-foreground">
                      {location.contact_phone}
                    </p>
                  )}
                </div>
              </div>
            )}
            {location.revenue_url && (
              <div className="flex items-center gap-3">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate max-w-xs">
                  Revenue URL configured
                </span>
              </div>
            )}
            {location.comments && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 mt-1 text-muted-foreground" />
                <p className="text-sm">{location.comments}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contract Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Contract</p>
                <p className="font-medium">
                  {location.has_contract ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Percentage Share
                </p>
                <p className="text-2xl font-bold">
                  {location.percentage_share}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fees</p>
                <p className="font-medium">
                  ${Number(location.fees).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Machines</p>
                <p className="font-medium">{machines?.length ?? 0}</p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Dispenser</p>
              {dispenser ? (
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <p className="font-medium">
                      {dispenser.serial_number || "No serial #"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Cash: ${Number(dispenser.dispenser_cash).toFixed(2)}
                    </p>
                  </div>
                  {isAdmin && (
                    <LocationActions
                      location={location}
                      isAdmin={isAdmin}
                      dispenserId={dispenser.id}
                      showDispenserRemove
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm mt-1">None</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Machines at this location */}
      <LocationMachines
        locationId={id}
        machines={machines ?? []}
        inventoryMachines={inventoryMachines ?? []}
        inventoryDispensers={inventoryDispensers ?? []}
        dispenser={dispenser}
        isAdmin={isAdmin}
        isClosed={!!location.close_date}
      />
    </div>
  );
}
