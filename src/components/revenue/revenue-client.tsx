"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRevenueMachineLines } from "@/hooks/use-revenue-machine-lines";
import {
  RevenueTable,
  MachineLinesTable,
  type RevenueRowData,
} from "@/components/revenue/revenue-table";
import type { RevenueRecord, Location } from "@/types/database";

interface RevenueRecordWithLocation extends RevenueRecord {
  locations: Pick<Location, "location_number" | "name" | "state"> | null;
}

interface RevenueClientProps {
  revenueRecords: RevenueRecordWithLocation[];
  isAdmin: boolean;
}

export function RevenueClient({ revenueRecords, isAdmin }: RevenueClientProps) {
  const [fetching, setFetching] = useState(false);
  const queryClient = useQueryClient();

  async function handleFetchAll() {
    setFetching(true);
    try {
      const res = await fetch("/api/revenue/fetch-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const successes = data.results.filter(
          (r: { status: string }) => r.status === "success"
        ).length;
        const errors = data.results.filter(
          (r: { status: string }) => r.status === "error"
        );
        const firstResult = data.results[0];
        const hasData = firstResult?.cash_in > 0 || firstResult?.net_revenue > 0;
        if (hasData) {
          toast.success(
            `Fetched revenue for ${successes}/${data.results.length} locations`
          );
        } else {
          const preview = firstResult?.html_preview || "empty";
          const errMsg = errors.length > 0 ? errors[0].error : "none";
          toast.error(
            `Data returned 0. First location: ${firstResult?.location_number}. Error: ${errMsg}. HTML starts with: ${preview.substring(0, 200)}`
          );
        }
        queryClient.invalidateQueries();
      } else {
        toast.error(data.error || "Failed to fetch revenue");
      }
    } catch {
      toast.error("Failed to fetch revenue");
    }
    setFetching(false);
  }

  const rows: RevenueRowData[] = revenueRecords.map((r) => ({
    id: r.id,
    location: r.locations
      ? {
          location_number: r.locations.location_number,
          name: r.locations.name,
          state: r.locations.state,
        }
      : null,
    period_start: r.period_start,
    period_end: r.period_end,
    cash_in: Number(r.cash_in),
    cash_out: Number(r.cash_out),
    net_revenue: Number(r.net_revenue),
    fee_amount: Number(r.fee_amount),
    company_share_pct: Number(r.company_share_pct),
    company_revenue: Number(r.company_revenue),
  }));

  return (
    <RevenueTable
      rows={rows}
      controls={
        isAdmin ? (
          <Button onClick={handleFetchAll} disabled={fetching}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${fetching ? "animate-spin" : ""}`}
            />
            {fetching ? "Fetching..." : "Fetch All Revenue"}
          </Button>
        ) : undefined
      }
      renderExpanded={(row) => (
        <MachineLinesSubTable revenueRecordId={row.id} />
      )}
      emptyMessage={
        <>
          No revenue data yet.{" "}
          {isAdmin && "Click 'Fetch All Revenue' to get started."}
        </>
      }
    />
  );
}

function MachineLinesSubTable({
  revenueRecordId,
}: {
  revenueRecordId: string;
}) {
  const { data: lines, isLoading } = useRevenueMachineLines(revenueRecordId);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!lines || lines.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No per-machine breakdown for this period. Re-fetch revenue to populate
        it.
      </p>
    );
  }

  return <MachineLinesTable lines={lines} />;
}
