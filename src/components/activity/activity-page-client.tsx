"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ActivityClient } from "@/components/activity/activity-client";
import { useActivity } from "@/hooks/use-activity";

export function ActivityPageClient() {
  const { data: auditLog, isLoading } = useActivity();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Complete audit trail of all actions
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <ActivityClient auditLog={auditLog ?? []} />
      )}
    </div>
  );
}
