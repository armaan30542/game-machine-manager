import { WeeklyClient } from "@/components/weekly/weekly-client";

export default function WeeklyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Weekly Revenue</h1>
        <p className="text-sm text-muted-foreground">
          Revenue by state for each Monday-to-Sunday week, compared with the
          week before, and the Monday text that reports it.
        </p>
      </div>
      <WeeklyClient />
    </div>
  );
}
