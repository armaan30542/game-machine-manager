"use client";

import { ChangesClient } from "@/components/changes/changes-client";

export function ChangesPageClient() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Changes</h1>
        <p className="text-sm text-muted-foreground">
          Locations added or closed, machine moves, and new inventory for any
          date range.
        </p>
      </div>
      <ChangesClient />
    </div>
  );
}
