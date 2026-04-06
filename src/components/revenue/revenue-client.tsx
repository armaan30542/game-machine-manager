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
import { RefreshCw, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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

export function RevenueClient({
  revenueRecords,
  locations,
  isAdmin,
}: RevenueClientProps) {
  const [fetching, setFetching] = useState(false);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const router = useRouter();

  const filtered = revenueRecords.filter((r) => {
    if (stateFilter === "all") return true;
    return (r.locations as Record<string, string> | null)?.state === stateFilter;
  });

  const totalCashIn = filtered.reduce((s, r) => s + Number(r.cash_in), 0);
  const totalCashOut = filtered.reduce((s, r) => s + Number(r.cash_out), 0);
  const totalNet = filtered.reduce((s, r) => s + Number(r.net_revenue), 0);
  const totalCompany = filtered.reduce(
    (s, r) => s + Number(r.company_revenue),
    0
  );

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
          // Show debug info if all values are 0
          const preview = firstResult?.html_preview || "empty";
          const errMsg = errors.length > 0 ? errors[0].error : "none";
          toast.error(
            `Data returned 0. First location: ${firstResult?.location_number}. Error: ${errMsg}. HTML starts with: ${preview.substring(0, 200)}`
          );
        }
        router.refresh();
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
            <div className="text-2xl font-bold">{fmt(totalNet)}</div>
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
              <TableHead>Location</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Cash In</TableHead>
              <TableHead className="text-right">Cash Out</TableHead>
              <TableHead className="text-right">Net Revenue</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Share %</TableHead>
              <TableHead className="text-right">Company Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
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
              filtered.map((r) => (
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
                  <TableCell className="text-right font-medium">
                    {fmt(Number(r.net_revenue))}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(Number(r.fee_amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.company_share_pct}%
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {fmt(Number(r.company_revenue))}
                  </TableCell>
                </TableRow>
              ))
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
