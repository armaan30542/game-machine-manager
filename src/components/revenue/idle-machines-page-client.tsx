"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useIdleMachines } from "@/hooks/use-idle-machines";
import { IdleMachinesClient } from "@/components/revenue/idle-machines-client";
import { IDLE_STALE_DAYS } from "@/lib/idle-machines";

export function IdleMachinesPageClient() {
  const { data, isLoading } = useIdleMachines();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Idle Machines</h1>
        <p className="text-muted-foreground">
          Machines with no fresh meter read in {IDLE_STALE_DAYS}+ days.
        </p>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <IdleMachinesClient lines={data.flagged} />
      )}
    </div>
  );
}
