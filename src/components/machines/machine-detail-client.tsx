"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit } from "lucide-react";
import { MachinePhoto } from "@/components/machines/machine-photo";
import { MachineForm } from "@/components/machines/machine-form";
import type { Machine, AuditLogEntry } from "@/types/database";

interface MachineDetailClientProps {
  machine: Machine & {
    locations: { id: string; location_number: string; name: string } | null;
  };
  auditLog: AuditLogEntry[];
  isAdmin: boolean;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    machine_added_to_location: "Added to location",
    machine_removed_from_location: "Removed from location",
    machine_replaced: "Replaced",
    machine_created: "Created",
    machine_edited: "Edited",
  };
  return map[action] || action;
}

export function MachineDetailClient({
  machine,
  auditLog,
  isAdmin,
}: MachineDetailClientProps) {
  const searchParams = useSearchParams();
  const editParam = searchParams.get("edit") === "true";
  const [editing, setEditing] = useState(isAdmin && editParam);

  // useState's initializer only runs once. In the App Router, useSearchParams
  // can return empty on the initial prerender/hydration, so ?edit=true is
  // missed unless we sync in an effect.
  useEffect(() => {
    if (isAdmin && editParam) setEditing(true);
  }, [isAdmin, editParam]);

  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setEditing(false)}>
          Cancel Edit
        </Button>
        <MachineForm machine={machine} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Details</CardTitle>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Machine Type</p>
                <p className="font-medium">{machine.machine_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cabinet Type</p>
                <p className="font-medium">{machine.cabinet_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Serial Number</p>
                <p className="font-mono">{machine.serial_number ?? "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {machine.location_id ? (
                  <div>
                    <Badge variant="default" className="mb-1">
                      Deployed
                    </Badge>
                    {machine.locations && (
                      <p className="text-sm">
                        <Link
                          href={`/locations/${machine.locations.id}`}
                          className="text-primary hover:underline"
                        >
                          {machine.locations.location_number} -{" "}
                          {machine.locations.name}
                        </Link>
                      </p>
                    )}
                    {machine.position_at_location && (
                      <p className="text-xs text-muted-foreground">
                        Position {machine.position_at_location}
                      </p>
                    )}
                  </div>
                ) : (
                  <Badge variant="secondary">Inventory</Badge>
                )}
              </div>
            </div>
            {machine.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm">{machine.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photo</CardTitle>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <MachinePhoto
                machineId={machine.id}
                photoPath={machine.photo_path}
              />
            ) : machine.photo_path ? (
              <img
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/machine-photos/${machine.photo_path}`}
                alt="Machine"
                className="rounded-lg max-h-64 object-cover w-full"
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No photo
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">History</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No history yet
            </p>
          ) : (
            <div className="space-y-3">
              {auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 text-sm border-b pb-3 last:border-0"
                >
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{formatAction(entry.action)}</p>
                    {entry.locations && (
                      <p className="text-xs text-muted-foreground">
                        {(entry.locations as { name: string }).name}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        {entry.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                      {entry.profiles &&
                        ` by ${(entry.profiles as { full_name: string | null; email: string }).full_name || (entry.profiles as { email: string }).email}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
