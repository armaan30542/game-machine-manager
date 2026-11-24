import { MonthlyChangesClient } from "@/components/monthly-changes/monthly-changes-client";

export default function MonthlyChangesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monthly Changes</h1>
        <p className="text-sm text-muted-foreground">
          Everything that changed in a month, from the snapshot taken when the
          month ended compared with the one before it.
        </p>
      </div>
      <MonthlyChangesClient />
    </div>
  );
}
