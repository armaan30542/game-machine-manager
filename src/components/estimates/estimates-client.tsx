"use client";

import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useEstimates } from "@/hooks/use-estimates";
import { useProfile } from "@/hooks/use-profile";
import type { SettlementEstimate } from "@/types/database";

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  VA: "Virginia",
  FL: "Florida",
};
const STATE_ORDER = ["TX", "VA", "FL"];

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "–"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n);

const day = (iso: string | null | undefined) => {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

type StateFilter = "all" | "TX" | "VA" | "FL";

export function EstimatesClient() {
  const { data, isLoading } = useEstimates();
  const { isAdmin } = useProfile();
  const queryClient = useQueryClient();
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const locById = new Map(data.locations.map((l) => [l.id, l]));
    const runningByLoc = new Map(data.running.map((r) => [r.location_id, r]));
    const clearedLocIds = new Set(data.openPeriods.map((p) => p.location_id));

    const cleared = data.openPeriods
      .map((p) => ({ ...p, location: locById.get(p.location_id) }))
      .filter((p) => p.location);
    const notCleared = data.locations
      .filter((l) => !l.close_date && l.revenue_url && !clearedLocIds.has(l.id))
      .map((l) => ({ location: l, record: runningByLoc.get(l.id) ?? null }));
    const noLink = data.locations.filter((l) => !l.close_date && !l.revenue_url);

    const states = STATE_ORDER.filter((s) =>
      data.locations.some((l) => l.state === s && !l.close_date)
    );
    const byState = states.map((s) => {
      const c = cleared.filter((p) => p.location!.state === s);
      const n = notCleared.filter((x) => x.location.state === s);
      return {
        state: s,
        clearedEstimate: c.reduce((t, p) => t + Number(p.company_revenue), 0),
        clearedLocations: new Set(c.map((p) => p.location_id)).size,
        notClearedCount: n.length,
        runningEstimate: n.reduce(
          (t, x) => t + Number(x.record?.company_revenue ?? 0),
          0
        ),
      };
    });

    return { cleared, notCleared, noLink, byState };
  }, [data]);

  async function runDailyJob() {
    setRunning(true);
    try {
      const res = await fetch("/api/cron/daily", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "The check did not finish");
      } else {
        const found = body.cleared?.length ?? 0;
        toast.success(
          `Checked ${body.refreshed} locations. ${
            found ? `${found} cleared since the last check.` : "No new clears."
          }${body.skipped ? ` ${body.skipped} left for the next run.` : ""}`
        );
        queryClient.invalidateQueries({ queryKey: ["estimates"] });
        queryClient.invalidateQueries({ queryKey: ["revenue"] });
      }
    } catch {
      toast.error("The check did not finish");
    } finally {
      setRunning(false);
    }
  }

  if (isLoading || !data || !view) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (data.notInstalled) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Estimates are not set up yet. Run database script 009 in Supabase,
          then reload this page.
        </CardContent>
      </Card>
    );
  }

  const inState = (s: string) => stateFilter === "all" || s === stateFilter;
  const cleared = view.cleared.filter((p) => inState(p.location!.state));
  const notCleared = view.notCleared.filter((x) => inState(x.location.state));
  const settlements = data.settlements.filter((s) => inState(s.state));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={stateFilter}
          onValueChange={(v) => v && setStateFilter(v as StateFilter)}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="TX">Texas</SelectItem>
            <SelectItem value="VA">Virginia</SelectItem>
            <SelectItem value="FL">Florida</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button onClick={runDailyJob} disabled={running} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Checking ksys22…" : "Check for clears now"}
          </Button>
        )}
      </div>

      {/* Standing by state */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {view.byState.filter((s) => inState(s.state)).map((s) => (
          <Card key={s.state}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Badge variant="outline">{s.state}</Badge>
                {STATE_NAMES[s.state]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold">{money(s.clearedEstimate)}</div>
              <p className="text-sm text-muted-foreground">
                expected from {s.clearedLocations} cleared{" "}
                {s.clearedLocations === 1 ? "location" : "locations"} awaiting a
                sheet
              </p>
              <p className="text-sm text-muted-foreground">
                {s.notClearedCount} not cleared yet, {money(s.runningEstimate)}{" "}
                building up
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cleared, awaiting a sheet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Cleared, awaiting a settlement sheet ({cleared.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Each row is a ksys22 period that ended with a clear. The estimate is
            period net, less fees, times the location&apos;s % share.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Cleared on</TableHead>
                  <TableHead className="text-right">Period net</TableHead>
                  <TableHead className="text-right">% share</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cleared.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nothing has cleared since the last settlement sheet.
                    </TableCell>
                  </TableRow>
                ) : (
                  cleared.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.location!.location_number} - {p.location!.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.location!.state}</Badge>
                      </TableCell>
                      <TableCell>
                        {day(p.period_start)} to {day(p.period_end)}
                        {p.source === "last_seen" && (
                          <Badge
                            variant="outline"
                            className="ml-2 border-orange-300 text-orange-700"
                            title="The date-range read from ksys22 failed, so this is the last figure seen before the clear and may be slightly low."
                          >
                            last seen
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{day(p.cleared_on)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(Number(p.net_revenue))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(p.company_share_pct)}%
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(Number(p.company_revenue))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Not cleared */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Not cleared yet ({notCleared.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Locations still in the same ksys22 period as at the last settlement
            sheet. Their figures keep building until the next clear.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Period started</TableHead>
                  <TableHead className="text-right">Net so far</TableHead>
                  <TableHead className="text-right">Estimate so far</TableHead>
                  <TableHead>Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notCleared.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Every location has cleared since the last sheet.
                    </TableCell>
                  </TableRow>
                ) : (
                  notCleared.map(({ location, record }) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">
                        {location.location_number} - {location.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{location.state}</Badge>
                      </TableCell>
                      <TableCell>{day(record?.period_start)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(record ? Number(record.net_revenue) : null)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(record ? Number(record.company_revenue) : null)}
                      </TableCell>
                      <TableCell>
                        {record ? day(record.fetched_at) : "Never"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {view.noLink.filter((l) => inState(l.state)).length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No ksys22 link, so no estimate:{" "}
              {view.noLink
                .filter((l) => inState(l.state))
                .map((l) => `${l.location_number} - ${l.name}`)
                .join("; ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Past settlements */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Settlement sheets: estimate vs actual ({settlements.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Taken when a sheet is saved in the ledger. Select a row for the
              locations behind it.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Sheet</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Sheet date</TableHead>
                    <TableHead className="text-right">Estimate</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right">Cleared</TableHead>
                    <TableHead className="text-right">Not cleared</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No settlement sheets yet. Save one in the ledger to
                        take the first snapshot.
                      </TableCell>
                    </TableRow>
                  ) : (
                    settlements.map((s) => (
                      <SettlementRows
                        key={s.id}
                        row={s}
                        open={expanded === s.id}
                        onToggle={() =>
                          setExpanded(expanded === s.id ? null : s.id)
                        }
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SettlementRows({
  row,
  open,
  onToggle,
}: {
  row: SettlementEstimate;
  open: boolean;
  onToggle: () => void;
}) {
  const estimate = Number(row.estimate);
  const actual = row.actual === null ? null : Number(row.actual);
  const diff = actual === null ? null : actual - estimate;
  const details = row.details ?? { cleared: [], not_cleared: [], no_link: [] };

  return (
    <Fragment>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">
          {row.statement_period ?? row.statement_id}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{row.state}</Badge>
        </TableCell>
        <TableCell>{day(row.sheet_date)}</TableCell>
        <TableCell className="text-right tabular-nums">{money(estimate)}</TableCell>
        <TableCell className="text-right tabular-nums">{money(actual)}</TableCell>
        <TableCell
          className={`text-right font-medium tabular-nums ${
            diff !== null && diff < 0 ? "text-red-600" : ""
          }`}
        >
          {diff === null ? "–" : `${diff > 0 ? "+" : ""}${money(diff)}`}
        </TableCell>
        <TableCell className="text-right tabular-nums">{row.cleared_count}</TableCell>
        <TableCell className="text-right tabular-nums">
          {row.not_cleared_count}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/40">
            <div className="grid gap-4 py-2 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium">
                  Cleared ({details.cleared.length})
                </p>
                {details.cleared.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {details.cleared.map((c, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>
                          {c.location_number} - {c.name}{" "}
                          <span className="text-muted-foreground">
                            ({day(c.period_start)} to {day(c.period_end)},{" "}
                            {money(c.net_revenue)} at {c.share_pct}%)
                          </span>
                        </span>
                        <span className="tabular-nums">{money(c.estimate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Not cleared ({details.not_cleared.length})
                </p>
                {details.not_cleared.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {details.not_cleared.map((c, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>
                          {c.location_number} - {c.name}{" "}
                          <span className="text-muted-foreground">
                            (since {day(c.period_start)})
                          </span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {money(c.running_estimate)} so far
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
