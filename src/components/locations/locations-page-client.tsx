"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { LocationsClient } from "@/components/locations/locations-client";
import { useLocations } from "@/hooks/use-locations";
import { useProfile } from "@/hooks/use-profile";

export function LocationsPageClient() {
  const { data: locations, isLoading } = useLocations();
  const { isAdmin } = useProfile();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-sm text-muted-foreground">
            Manage all your store locations
          </p>
        </div>
        {isAdmin && (
          <Link href="/locations/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Location
            </Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <LocationsClient locations={locations ?? []} />
      )}
    </div>
  );
}
