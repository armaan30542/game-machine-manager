"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarRange } from "lucide-react";
import { toast } from "sonner";
import type { MachineLine } from "@/lib/revenue-parser";

interface LocationOption {
  id: string;
  location_number: string;
  name: string;
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

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function RevenueByDateClient({
  locations,
  isAdmin,
}: {
  locations: LocationOption[];
  isAdmin: boolean;
}) {
  const [locationId, setLocationId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ByDateResult | null>(null);

  async function handleRun() {
    if (!locationId || !startDate || !endDate) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/revenue/by-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data as ByDateResult);
        toast.success("Report generated");
      } else {
        toast.error(data.error || "Failed to run report");
      }
    } catch {
      toast.error("Failed to run report");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={locationId}
                onValueChange={(v) => v && setLocationId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.location_number} - {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start">Start Date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">End Date</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {!isAdmin && (
            <p className="text-sm text-muted-foreground">
              Only admins can run revenue reports.
            </p>
          )}
          <Button
            onClick={handleRun}
            disabled={
              !isAdmin || !locationId || !startDate || !endDate || loading
            }
          >
            <CalendarRange className="mr-2 h-4 w-4" />
            {loading ? "Running..." : "Run Report"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Cash In" value={fmt(result.cash_in)} />
            <SummaryCard label="Cash Out" value={fmt(result.cash_out)} />
            <SummaryCard
              label="Net Revenue"
              value={fmt(result.net_revenue)}
              negative={result.net_revenue < 0}
            />
            <SummaryCard
              label="Company Revenue"
              value={fmt(result.company_revenue)}
              negative={result.company_revenue < 0}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Period {result.period_start} to {result.period_end} · Fee{" "}
            {fmt(result.fee_amount)} · Share {result.company_share_pct}%
          </p>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pos</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead className="text-right">Cash In</TableHead>
                  <TableHead className="text-right">Cash Out</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Last Read</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.machine_lines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No per-machine data for this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  result.machine_lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.position ?? "-"}</TableCell>
                      <TableCell className="font-medium">
                        {l.game_name}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {fmt(l.cash_in)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {fmt(l.cash_out)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${l.net_revenue < 0 ? "text-red-600" : ""}`}
                      >
                        {fmt(l.net_revenue)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {l.last_read_date ?? "Never"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${negative ? "text-red-600" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
