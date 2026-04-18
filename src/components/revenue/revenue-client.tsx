"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { RevenueRecord, Location } from "@/types/database";

interface RevenueRecordWithLocation extends RevenueRecord {
  locations: Pick<Location, "location_number" | "name" | "state"> | null;
}

interface RevenueClientProps {
  revenueRecords: RevenueRecordWithLocation[];
  locations: Pick<
    Location,
    "id" | "location_number" | "name" | "state" | "percentage_share" | "fees" | "revenue_url"
  >[];
  isAdmin: boolean;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

type SortKey =
  | "location"
  | "state"
  | "period"
  | "cash_in"
  | "cash_out"
  | "net_revenue"
  | "fee_amount"
  | "company_share_pct"
  | "company_revenue";

type SortDir = "asc" | "desc";

function getSortValue(r: RevenueRecordWithLocation, key: SortKey): string | number {
  const loc = r.locations as Record<string, string> | null;
  switch (key) {
    case "location":
      return loc?.location_number ?? "";
    case "state":
      return loc?.state ?? "";
    case "period":
      return r.period_start;
    case "cash_in":
      return Number(r.cash_in);
    case "cash_out":
      return Number(r.cash_out);
    case "net_revenue":
      return Number(r.net_revenue);
    case "fee_amount":
      return Number(r.fee_amount);
    case "company_share_pct":
      return Number(r.company_share_pct);
    case "company_revenue":
      return Number(r.company_revenue);
  }
}

export function RevenueClient({
  revenueRecords,
  locations,
  isAdmin,
}: RevenueClientProps) {
  const [fetching, setFetching] = useState(false);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("company_revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const queryClient = useQueryClient();

  const filtered = revenueRecords.filter((r) => {
    if (stateFilter === "all") return true;
    return (r.locations as Record<string, string> | null)?.state === stateFilter;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);
    const cmp = typeof aVal === "number" && typeof bVal === "number"
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalCashIn = filtered.reduce((s, r) => s + Number(r.cash_in), 0);
  const totalCashOut = filtered.reduce((s, r) => s + Number(r.cash_out), 0);
  const totalNet = filtered.reduce((s, r) => s + Number(r.net_revenue), 0);
  const totalCompany = filtered.reduce(
    (s, r) => s + Number(r.company_revenue),
    0
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "location" || key === "state" || key === "period" ? "asc" : "desc");
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  }

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

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cash In</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {fmt(totalCashIn)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cash Out</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {fmt(totalCashOut)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalNet < 0 ? "text-red-600" : ""}`}>
              {fmt(totalNet)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Company Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {fmt(totalCompany)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={stateFilter} onValueChange={(v) => v && setStateFilter(v)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="VA">Virginia</SelectItem>
            <SelectItem value="TX">Texas</SelectItem>
          </SelectContent>
        </Select>

        {isAdmin && (
          <Button onClick={handleFetchAll} disabled={fetching}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${fetching ? "animate-spin" : ""}`}
            />
            {fetching ? "Fetching..." : "Fetch All Revenue"}
          </Button>
        )}
      </div>

      {/* Revenue table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {([
                ["location", "Location"],
                ["state", "State"],
                ["period", "Period"],
                ["cash_in", "Cash In"],
                ["cash_out", "Cash Out"],
                ["net_revenue", "Net Revenue"],
                ["fee_amount", "Fee"],
                ["company_share_pct", "Share %"],
                ["company_revenue", "Company Revenue"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead
                  key={key}
                  className={`${key !== "location" && key !== "state" && key !== "period" ? "text-right" : ""} cursor-pointer select-none hover:bg-muted/50`}
                  onClick={() => handleSort(key)}
                >
                  <span className="inline-flex items-center">
                    {label}
                    <SortIcon column={key} />
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-8 text-muted-foreground"
                >
                  No revenue data yet.{" "}
                  {isAdmin && "Click 'Fetch All Revenue' to get started."}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => {
                const netNeg = Number(r.net_revenue) < 0;
                const compNeg = Number(r.company_revenue) < 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {(r.locations as Record<string, string> | null)?.location_number}{" "}
                      - {(r.locations as Record<string, string> | null)?.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {(r.locations as Record<string, string> | null)?.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.period_start} to {r.period_end}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {fmt(Number(r.cash_in))}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {fmt(Number(r.cash_out))}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${netNeg ? "text-red-600" : ""}`}>
                      {fmt(Number(r.net_revenue))}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(Number(r.fee_amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.company_share_pct}%
                    </TableCell>
                    <TableCell className={`text-right font-bold ${compNeg ? "text-red-600" : "text-primary"}`}>
                      {fmt(Number(r.company_revenue))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Formula: Company Revenue = (Net Revenue - Fee) x Share %
      </p>
    </div>
  );
}
