"use client";

import { Fragment, useState, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  Search,
} from "lucide-react";

export interface RevenueRowData {
  id: string;
  location: { location_number: string; name: string; state: string } | null;
  period_start: string;
  period_end: string;
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  fee_amount: number;
  company_share_pct: number;
  company_revenue: number;
}

interface MachineLineRow {
  position: number | null;
  game_name: string;
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  last_read_date: string | null;
}

export function fmt(n: number): string {
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

function getSortValue(r: RevenueRowData, key: SortKey): string | number {
  switch (key) {
    case "location":
      return r.location?.location_number ?? "";
    case "state":
      return r.location?.state ?? "";
    case "period":
      return r.period_start;
    case "cash_in":
      return r.cash_in;
    case "cash_out":
      return r.cash_out;
    case "net_revenue":
      return r.net_revenue;
    case "fee_amount":
      return r.fee_amount;
    case "company_share_pct":
      return r.company_share_pct;
    case "company_revenue":
      return r.company_revenue;
  }
}

interface RevenueTableProps {
  rows: RevenueRowData[];
  /** Extra controls rendered on the right of the filter row. */
  controls?: ReactNode;
  /** Content rendered when a row is expanded. */
  renderExpanded: (row: RevenueRowData) => ReactNode;
  /** Message shown when there are no rows. */
  emptyMessage?: ReactNode;
}

/**
 * Shared revenue layout: summary cards, search/state filters, a sortable
 * table and click-to-expand per-machine rows. Used by both the Revenue
 * page and the Revenue by Date page so they look identical.
 */
export function RevenueTable({
  rows,
  controls,
  renderExpanded,
  emptyMessage,
}: RevenueTableProps) {
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("company_revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (stateFilter !== "all" && r.location?.state !== stateFilter) return false;
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      const hay = `${r.location?.location_number ?? ""} ${r.location?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);
    const cmp =
      typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalCashIn = filtered.reduce((s, r) => s + r.cash_in, 0);
  const totalCashOut = filtered.reduce((s, r) => s + r.cash_out, 0);
  const totalNet = filtered.reduce((s, r) => s + r.net_revenue, 0);
  const totalCompany = filtered.reduce((s, r) => s + r.company_revenue, 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "location" || key === "state" || key === "period"
          ? "asc"
          : "desc"
      );
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column)
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
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
            <div
              className={`text-2xl font-bold ${totalNet < 0 ? "text-red-600" : ""}`}
            >
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search location name or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={stateFilter}
            onValueChange={(v) => v && setStateFilter(v)}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              <SelectItem value="VA">Virginia</SelectItem>
              <SelectItem value="TX">Texas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {controls}
      </div>

      {/* Revenue table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {(
                [
                  ["location", "Location"],
                  ["state", "State"],
                  ["period", "Period"],
                  ["cash_in", "Cash In"],
                  ["cash_out", "Cash Out"],
                  ["net_revenue", "Net Revenue"],
                  ["fee_amount", "Fee"],
                  ["company_share_pct", "Share %"],
                  ["company_revenue", "Company Revenue"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
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
                  {emptyMessage ?? "No revenue data yet."}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => {
                const netNeg = r.net_revenue < 0;
                const compNeg = r.company_revenue < 0;
                const isExpanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : r.id)
                      }
                    >
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {r.location?.location_number} - {r.location?.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.location?.state}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.period_start} to {r.period_end}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {fmt(r.cash_in)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {fmt(r.cash_out)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${netNeg ? "text-red-600" : ""}`}
                      >
                        {fmt(r.net_revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(r.fee_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.company_share_pct}%
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold ${compNeg ? "text-red-600" : "text-primary"}`}
                      >
                        {fmt(r.company_revenue)}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                          {renderExpanded(r)}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
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

/**
 * Per-machine breakdown table shown inside an expanded revenue row.
 * Accepts both database rows and freshly-parsed report lines.
 */
export function MachineLinesTable({ lines }: { lines: MachineLineRow[] }) {
  if (lines.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No per-machine breakdown for this period.
      </p>
    );
  }

  return (
    <div className="p-3">
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
          {lines.map((l, i) => {
            const net = Number(l.net_revenue);
            return (
              <TableRow key={i}>
                <TableCell>{l.position ?? "-"}</TableCell>
                <TableCell className="font-medium">{l.game_name}</TableCell>
                <TableCell className="text-right text-green-600">
                  {fmt(Number(l.cash_in))}
                </TableCell>
                <TableCell className="text-right text-red-600">
                  {fmt(Number(l.cash_out))}
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${net < 0 ? "text-red-600" : ""}`}
                >
                  {fmt(net)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {l.last_read_date ?? "Never"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
