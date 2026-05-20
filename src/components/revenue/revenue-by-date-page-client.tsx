"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useRevenue } from "@/hooks/use-revenue";
import { useProfile } from "@/hooks/use-profile";
import { RevenueByDateClient } from "@/components/revenue/revenue-by-date-client";

export function RevenueByDatePageClient() {
  const { data, isLoading } = useRevenue();
  const { profile } = useProfile();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue by Date</h1>
        <p className="text-muted-foreground">
          Run a custom date-range report for a location.
        </p>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <RevenueByDateClient
          locations={data.locations.filter((l) => l.revenue_url)}
          isAdmin={profile?.role === "admin"}
        />
      )}
    </div>
  );
}
