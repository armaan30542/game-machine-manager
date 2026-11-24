import { EstimatesClient } from "@/components/estimates/estimates-client";

export default function EstimatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estimates</h1>
        <p className="text-sm text-muted-foreground">
          Expected income from each location&apos;s cleared ksys22 period, by
          state, and how it compared with each settlement sheet.
        </p>
      </div>
      <EstimatesClient />
    </div>
  );
}
