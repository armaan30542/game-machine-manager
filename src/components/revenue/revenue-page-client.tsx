"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { RevenueClient } from "@/components/revenue/revenue-client";
import { useRevenue } from "@/hooks/use-revenue";
import { useProfile } from "@/hooks/use-profile";

export function RevenuePageClient() {
  const { data, isLoading } = useRevenue();
  const { isAdmin } = useProfile();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="text-sm text-muted-foreground">
          Track revenue across all locations
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <RevenueClient
          revenueRecords={data?.revenueRecords ?? []}
          locations={data?.locations ?? []}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
