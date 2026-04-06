"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MachineDetailClient } from "@/components/machines/machine-detail-client";
import { useMachineDetail } from "@/hooks/use-machine-detail";
import { useProfile } from "@/hooks/use-profile";

function MachineDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-4 w-48 mb-2" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-32 mt-2" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
          <CardContent><Skeleton className="h-32 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
          <CardContent><Skeleton className="h-32 w-full" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

export function MachineDetailPageClient({ id }: { id: string }) {
  const { data, isLoading } = useMachineDetail(id);
  const { isAdmin } = useProfile();

  if (isLoading || !data) return <MachineDetailSkeleton />;

  const { machine, auditLog } = data;

  if (!machine) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Machine not found</p>
        <Link href="/inventory" className="text-primary hover:underline text-sm">
          Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          {machine.locations ? (
            <>
              <Link
                href="/locations"
                className="text-sm text-muted-foreground hover:underline"
              >
                Locations
              </Link>
              <span className="text-sm text-muted-foreground">/</span>
              <Link
                href={`/locations/${machine.locations.id}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                {machine.locations.location_number}
              </Link>
            </>
          ) : (
            <Link
              href="/inventory"
              className="text-sm text-muted-foreground hover:underline"
            >
              Inventory
            </Link>
          )}
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">{machine.serial_number}</span>
        </div>
        <h1 className="text-2xl font-bold">{machine.machine_type}</h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline">{machine.cabinet_type}</Badge>
          {machine.location_id ? (
            <Badge variant="default">Deployed</Badge>
          ) : (
            <Badge variant="secondary">Inventory</Badge>
          )}
        </div>
      </div>

      <MachineDetailClient
        machine={machine}
        auditLog={auditLog}
        isAdmin={isAdmin}
      />
    </div>
  );
}
