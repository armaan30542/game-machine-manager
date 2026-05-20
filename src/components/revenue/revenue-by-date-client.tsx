"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarRange } from "lucide-react";
import { toast } from "sonner";
import type { MachineLine } from "@/lib/revenue-parser";
import {
  RevenueTable,
  MachineLinesTable,
  type RevenueRowData,
} from "@/components/revenue/revenue-table";

interface LocationOption {
  id: string;
  location_number: string;
  name: string;
  state: string;
}

interface ByDateResult {
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  period_start: string;
  period_end: string;
  machine_lines: MachineLine[];
  fee_amount: number;
  company_share_pct: number;
  company_revenue: number;
}

export function RevenueByDateClient({
  locations,
  isAdmin,
}: {
  locations: LocationOption[];
  isAdmin: boolean;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Record<string, ByDateResult>>({});
  const [hasRun, setHasRun] = useState(false);

  async function handleRun() {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      toast.error("Start date must be on or before end date");
      return;
    }

    setRunning(true);
    setHasRun(true);
    setResults({});
    setProgress({ done: 0, total: locations.length });

    let done = 0;
    let errorCount = 0;
    let logClaimed = false;
    const queue = [...locations];

    async function worker() {
      for (;;) {
        const loc = queue.shift();
        if (!loc) return;
        // Exactly one request per run logs a single activity entry.
        const claimLog = !logClaimed;
        logClaimed = true;
        try {
          const res = await fetch("/api/revenue/by-date", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location_id: loc.id,
              start_date: startDate,
              end_date: endDate,
              log_run: claimLog,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            setResults((prev) => ({ ...prev, [loc.id]: data as ByDateResult }));
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }
        done++;
        setProgress({ done, total: locations.length });
      }
    }

    // Run a few locations at a time to keep the report reasonably fast
    // without overwhelming ksys22.
    const concurrency = Math.min(3, locations.length);
    await Promise.all(Array.from({ length: concurrency }, worker));

    setRunning(false);
    if (errorCount === locations.length) {
      toast.error("Report failed for every location");
    } else if (errorCount > 0) {
      toast.warning(
        `Report ready (${locations.length - errorCount}/${locations.length} locations)`
      );
    } else {
      toast.success("Report ready");
    }
  }

  const rows: RevenueRowData[] = locations
    .filter((l) => results[l.id])
    .map((l) => {
      const r = results[l.id];
      return {
        id: l.id,
        location: {
          location_number: l.location_number,
          name: l.name,
          state: l.state,
        },
        period_start: r.period_start,
        period_end: r.period_end,
        cash_in: r.cash_in,
        cash_out: r.cash_out,
        net_revenue: r.net_revenue,
        fee_amount: r.fee_amount,
        company_share_pct: r.company_share_pct,
        company_revenue: r.company_revenue,
      };
    });

  const controls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        type="date"
        aria-label="Start date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="w-full sm:w-[150px]"
      />
      <span className="hidden text-sm text-muted-foreground sm:inline">to</span>
      <Input
        type="date"
        aria-label="End date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="w-full sm:w-[150px]"
      />
      <Button
        onClick={handleRun}
        disabled={!isAdmin || !startDate || !endDate || running}
      >
        <CalendarRange
          className={`mr-2 h-4 w-4 ${running ? "animate-pulse" : ""}`}
        />
        {running
          ? `Running ${progress.done}/${progress.total}`
          : "Run Report"}
      </Button>
    </div>
  );

  let emptyMessage: string;
  if (running) {
    emptyMessage = `Fetching revenue... ${progress.done}/${progress.total} locations`;
  } else if (!isAdmin) {
    emptyMessage = "Only admins can run revenue reports.";
  } else if (hasRun) {
    emptyMessage = "No revenue data returned for this date range.";
  } else {
    emptyMessage = "Pick a start and end date, then click Run Report.";
  }

  return (
    <RevenueTable
      rows={rows}
      controls={controls}
      renderExpanded={(row) => (
        <MachineLinesTable lines={results[row.id]?.machine_lines ?? []} />
      )}
      emptyMessage={emptyMessage}
    />
  );
}
