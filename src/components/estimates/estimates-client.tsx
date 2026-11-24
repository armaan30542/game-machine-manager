"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  SortHead,
  matchesSearch,
  sortRows,
  useSort,
} from "@/components/shared/sortable";
import { useEstimates, type EstimateLocation } from "@/hooks/use-estimates";
import { useProfile } from "@/hooks/use-profile";
import type { SettlementEstimate } from "@/types/database";

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  VA: "Virginia",
  FL: "Florida",
};
const STATE_ORDER = ["TX", "VA", "FL"];

/** A link counts as not refreshed when the last good read is older than this. */
const STALE_HOURS = 48;
/** A location counts as not reporting when no machine has been read for this long. */
const IDLE_DAYS = 3;

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
type ProblemKind = "missing" | "broken" | "not_updating";

const PROBLEM_META: Record<ProblemKind, { label: string; color: string }> = {
  missing: { label: "Missing link", color: "bg-slate-100 text-slate-800" },
  broken: { label: "Broken link", color: "bg-red-100 text-red-800" },
  not_updating: { label: "Not updating", color: "bg-orange-100 text-orange-800" },
};

/** Location name linking to its page, plus its ksys22 revenue page. */
function LocationLinks({ location }: { location: EstimateLocation }) {
  const url =
    location.revenue_url && /^https?:\/\//i.test(location.revenue_url)
      ? location.revenue_url
      : null;
  return (
    <span className="inline-flex items-center gap-2">
      <Link
        href={`/locations/${location.id}`}
        className="font-medium hover:underline"
      >
        {location.location_number} - {location.name}
      </Link>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open this location's ksys22 revenue page"
          aria-label={`Open the ksys22 revenue page for ${location.name}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

export function EstimatesClient() {
  const { data, isLoading, dataUpdatedAt } = useEstimates();
  const { isAdmin } = useProfile();
  const queryClient = useQueryClient();
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [search, setSearch] = useState("");
  const [problemFilter, setProblemFilter] = useState<"all" | ProblemKind>("all");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const problemSort = useSort<"location" | "state" | "problem" | "since">("problem");
  const clearedSort = useSort<
    "location" | "state" | "period" | "cleared" | "net" | "share" | "estimate"
  >("cleared", "desc");
  const openSort = useSort<
    "location" | "state" | "started" | "net" | "estimate" | "checked"
  >("location");
  const sheetSort = useSort<
    "sheet" | "state" | "date" | "estimate" | "actual" | "diff" | "cleared" | "open"
  >("date", "desc");

  const view = useMemo(() => {
    if (!data) return null;
    const locById = new Map(data.locations.map((l) => [l.id, l]));
    const locByNumber = new Map(data.locations.map((l) => [l.location_number, l]));
    const runningByLoc = new Map(data.running.map((r) => [r.location_id, r]));
    const clearedLocIds = new Set(data.openPeriods.map((p) => p.location_id));

    const cleared = data.openPeriods
      .map((p) => ({ ...p, location: locById.get(p.location_id)! }))
      .filter((p) => p.location);
    const notCleared = data.locations
      .filter((l) => !l.close_date && l.revenue_url && !clearedLocIds.has(l.id))
      .map((l) => ({ location: l, record: runningByLoc.get(l.id) ?? null }));

    // Links that need attention: missing, broken, or not updating.
    const now = dataUpdatedAt || 0;
    const problems: {
      location: EstimateLocation;
      kind: ProblemKind;
      detail: string;
      since: string | null;
    }[] = [];
    for (const l of data.locations) {
      if (l.close_date) continue;
      if (!l.revenue_url) {
        problems.push({
          location: l,
          kind: "missing",
          detail: "No ksys22 revenue link is saved for this location.",
          since: null,
        });
        continue;
      }
      const record = runningByLoc.get(l.id);
      const failure = data.latestFailure.get(l.id);
      if (failure && (!record || failure.created_at > record.fetched_at)) {
        problems.push({
          location: l,
          kind: "broken",
          detail: `${failure.error}${
            record ? ` Last good read ${day(record.fetched_at)}.` : " Never read successfully."
          }`,
          since: failure.created_at,
        });
        continue;
      }
      if (!record) {
        problems.push({
          location: l,
          kind: "not_updating",
          detail: "This link has never been read.",
          since: null,
        });
        continue;
      }
      const hoursOld = (now - new Date(record.fetched_at).getTime()) / 3_600_000;
      if (hoursOld > STALE_HOURS) {
        problems.push({
          location: l,
          kind: "not_updating",
          detail: `Not refreshed since ${day(record.fetched_at)}.`,
          since: record.fetched_at,
        });
        continue;
      }
      const lastRead = data.lastMachineRead.get(l.id);
      if (lastRead) {
        const daysOld =
          (now - new Date(lastRead + "T12:00:00").getTime()) / 86_400_000;
        if (daysOld > IDLE_DAYS) {
          problems.push({
            location: l,
            kind: "not_updating",
            detail: `The link works, but no machine has reported since ${day(lastRead)}.`,
            since: lastRead,
          });
        }
      }
    }

    const states = STATE_ORDER.filter((s) =>
      data.locations.some((l) => l.state === s && !l.close_date)
    );
    const byState = states.map((s) => {
      const c = cleared.filter((p) => p.location.state === s);
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

    return { cleared, notCleared, problems, byState, locByNumber };
  }, [data, dataUpdatedAt]);

  async function runDailyJob() {
    setRunning(true);
    try {
      const res = await fetch("/api/cron/daily", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "The check did not finish");
      } else {
        const found = body.cleared?.length ?? 0;
        const failed = body.errors?.length ?? 0;
        toast.success(
          `Checked ${body.refreshed} locations. ${
            found ? `${found} cleared since the last check.` : "No new clears."
          }${failed ? ` ${failed} could not be read; see the link report.` : ""}${
            body.skipped ? ` ${body.skipped} left for the next run.` : ""
          }`
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
  const matchLoc = (l: EstimateLocation) =>
    inState(l.state) && matchesSearch(search, l.location_number, l.name);

  const problems = sortRows(
    view.problems.filter(
      (p) =>
        matchLoc(p.location) &&
        (problemFilter === "all" || p.kind === problemFilter)
    ),
    problemSort,
    {
      location: (p) => p.location.location_number,
      state: (p) => p.location.state,
      problem: (p) => ["broken", "not_updating", "missing"].indexOf(p.kind),
      since: (p) => p.since,
    }
  );
  const cleared = sortRows(
    view.cleared.filter((p) => matchLoc(p.location)),
    clearedSort,
    {
      location: (p) => p.location.location_number,
      state: (p) => p.location.state,
      period: (p) => p.period_start,
      cleared: (p) => p.cleared_on,
      net: (p) => Number(p.net_revenue),
      share: (p) => Number(p.company_share_pct),
      estimate: (p) => Number(p.company_revenue),
    }
  );
  const notCleared = sortRows(
    view.notCleared.filter((x) => matchLoc(x.location)),
    openSort,
    {
      location: (x) => x.location.location_number,
      state: (x) => x.location.state,
      started: (x) => x.record?.period_start,
      net: (x) => (x.record ? Number(x.record.net_revenue) : null),
      estimate: (x) => (x.record ? Number(x.record.company_revenue) : null),
      checked: (x) => x.record?.fetched_at,
    }
  );
  const settlements = sortRows(
    data.settlements.filter(
      (s) =>
        inState(s.state) &&
        matchesSearch(search, s.statement_period, s.statement_id, s.state)
    ),
    sheetSort,
    {
      sheet: (s) => s.statement_period ?? s.statement_id,
      state: (s) => s.state,
      date: (s) => s.sheet_date ?? s.created_at,
      estimate: (s) => Number(s.estimate),
      actual: (s) => (s.actual === null ? null : Number(s.actual)),
      diff: (s) =>
        s.actual === null ? null : Number(s.actual) - Number(s.estimate),
      cleared: (s) => s.cleared_count,
      open: (s) => s.not_cleared_count,
    }
  );

  const clearedTotal = cleared.reduce((t, p) => t + Number(p.company_revenue), 0);
  const runningTotal = notCleared.reduce(
    (t, x) => t + Number(x.record?.company_revenue ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Filters: one row, applied to every table below */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search locations"
            placeholder="Search location name or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
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
          <Button
            onClick={runDailyJob}
            disabled={running}
            variant="outline"
            className="sm:ml-auto"
          >
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

      {/* Links needing attention */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">
              Links needing attention ({problems.length})
            </CardTitle>
            <Select
              value={problemFilter}
              onValueChange={(v) =>
                v && setProblemFilter(v as "all" | ProblemKind)
              }
            >
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Problem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All problems</SelectItem>
                <SelectItem value="broken">Broken link</SelectItem>
                <SelectItem value="not_updating">Not updating</SelectItem>
                <SelectItem value="missing">Missing link</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Active locations with no ksys22 link, a link whose last read
            failed, a link not refreshed in {STALE_HOURS} hours, or no machine
            reporting for {IDLE_DAYS} days. These have no reliable estimate.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Location" column="location" sort={problemSort} />
                  <SortHead label="State" column="state" sort={problemSort} />
                  <SortHead label="Problem" column="problem" sort={problemSort} />
                  <TableHead>Detail</TableHead>
                  <SortHead label="Since" column="since" sort={problemSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.length === 0 ? (
                  <EmptyRow span={5} text="Every link is saved, readable and up to date." />
                ) : (
                  problems.map((p) => (
                    <TableRow key={p.location.id}>
                      <TableCell>
                        <LocationLinks location={p.location} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.location.state}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`border-0 ${PROBLEM_META[p.kind].color}`}
                        >
                          {PROBLEM_META[p.kind].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm">
                        {p.detail}
                      </TableCell>
                      <TableCell>{day(p.since)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                  <SortHead label="Location" column="location" sort={clearedSort} />
                  <SortHead label="State" column="state" sort={clearedSort} />
                  <SortHead label="Period" column="period" sort={clearedSort} />
                  <SortHead label="Cleared on" column="cleared" sort={clearedSort} />
                  <SortHead label="Period net" column="net" sort={clearedSort} align="right" />
                  <SortHead label="% share" column="share" sort={clearedSort} align="right" />
                  <SortHead label="Estimate" column="estimate" sort={clearedSort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cleared.length === 0 ? (
                  <EmptyRow
                    span={7}
                    text="Nothing has cleared since the last settlement sheet."
                  />
                ) : (
                  <>
                    {cleared.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <LocationLinks location={p.location} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.location.state}</Badge>
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
                    ))}
                    <TableRow>
                      <TableCell colSpan={6} className="font-medium">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {money(clearedTotal)}
                      </TableCell>
                    </TableRow>
                  </>
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
                  <SortHead label="Location" column="location" sort={openSort} />
                  <SortHead label="State" column="state" sort={openSort} />
                  <SortHead label="Period started" column="started" sort={openSort} />
                  <SortHead label="Net so far" column="net" sort={openSort} align="right" />
                  <SortHead label="Estimate so far" column="estimate" sort={openSort} align="right" />
                  <SortHead label="Last checked" column="checked" sort={openSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notCleared.length === 0 ? (
                  <EmptyRow span={6} text="No locations match." />
                ) : (
                  <>
                    {notCleared.map(({ location, record }) => (
                      <TableRow key={location.id}>
                        <TableCell>
                          <LocationLinks location={location} />
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
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="font-medium">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {money(runningTotal)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
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
                    <SortHead label="Sheet" column="sheet" sort={sheetSort} />
                    <SortHead label="State" column="state" sort={sheetSort} />
                    <SortHead label="Sheet date" column="date" sort={sheetSort} />
                    <SortHead label="Estimate" column="estimate" sort={sheetSort} align="right" />
                    <SortHead label="Actual" column="actual" sort={sheetSort} align="right" />
                    <SortHead label="Difference" column="diff" sort={sheetSort} align="right" />
                    <SortHead label="Cleared" column="cleared" sort={sheetSort} align="right" />
                    <SortHead label="Not cleared" column="open" sort={sheetSort} align="right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.length === 0 ? (
                    <EmptyRow
                      span={9}
                      text="No settlement sheets yet. Save one in the ledger to take the first snapshot."
                    />
                  ) : (
                    settlements.map((s) => (
                      <SettlementRows
                        key={s.id}
                        row={s}
                        open={expanded === s.id}
                        onToggle={() =>
                          setExpanded(expanded === s.id ? null : s.id)
                        }
                        locByNumber={view.locByNumber}
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

function EmptyRow({ span, text }: { span: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={span} className="py-8 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function SettlementRows({
  row,
  open,
  onToggle,
  locByNumber,
}: {
  row: SettlementEstimate;
  open: boolean;
  onToggle: () => void;
  locByNumber: Map<string, EstimateLocation>;
}) {
  const estimate = Number(row.estimate);
  const actual = row.actual === null ? null : Number(row.actual);
  const diff = actual === null ? null : actual - estimate;
  const details = row.details ?? { cleared: [], not_cleared: [], no_link: [] };

  const name = (number: string, fallback: string) => {
    const location = locByNumber.get(number);
    return location ? (
      <LocationLinks location={location} />
    ) : (
      <span className="font-medium">
        {number} - {fallback}
      </span>
    );
  };

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
          <Link
            href="/ledger#statements"
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
            title="Open the Settlement Ledger"
          >
            {row.statement_period ?? row.statement_id}
          </Link>
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
                        <span className="whitespace-normal">
                          {name(c.location_number, c.name)}{" "}
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
                        <span className="whitespace-normal">
                          {name(c.location_number, c.name)}{" "}
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
