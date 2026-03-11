import { createClient } from "@/lib/supabase/server";
import { ActivityClient } from "@/components/activity/activity-client";

export default async function ActivityPage() {
  const supabase = await createClient();

  const { data: auditLog } = await supabase
    .from("audit_log")
    .select(
      "*, profiles:performed_by(email, full_name), locations:location_id(location_number, name), machines:machine_id(machine_type, serial_number)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Complete audit trail of all actions
        </p>
      </div>

      <ActivityClient auditLog={auditLog ?? []} />
    </div>
  );
}
