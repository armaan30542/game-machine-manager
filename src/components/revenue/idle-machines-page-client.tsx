"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useIdleMachines } from "@/hooks/use-idle-machines";
import { IdleMachinesClient } from "@/components/revenue/idle-machines-client";

export function IdleMachinesPageClient() {
  const { data, isLoading } = useIdleMachines();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Zero Revenue</h1>
        <p className="text-muted-foreground">
          Machines that earned $0 or less in the latest revenue period.
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
