import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MachineDetailClient } from "@/components/machines/machine-detail-client";

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: machine } = await supabase
    .from("machines")
    .select("*, locations:location_id(id, location_number, name)")
    .eq("id", id)
    .single();

  if (!machine) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const { data: auditLog } = await supabase
    .from("audit_log")
    .select(
      "*, profiles:performed_by(email, full_name), locations:location_id(location_number, name)"
    )
    .eq("machine_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

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
                href={`/locations/${(machine.locations as { id: string }).id}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                {(machine.locations as { location_number: string }).location_number}
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
        auditLog={auditLog ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
