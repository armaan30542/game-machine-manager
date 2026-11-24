"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
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
import { NotificationCard } from "@/components/weekly/notification-card";
import { SmsCard } from "@/components/weekly/sms-card";
import { useWeekly, type WeeklyLocation } from "@/hooks/use-weekly";
import { useProfile } from "@/hooks/use-profile";

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  VA: "Virginia",
  FL: "Florida",
};
const STATE_ORDER = ["TX", "VA", "FL"];

type StateFilter = "all" | "TX" | "VA" | "FL";

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "–"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const shortDate = (iso: string, withYear = false) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

const weekLabel = (start: string) =>
  `${shortDate(start)} to ${shortDate(addDays(start, 6), true)}`;

/** Change from `before` to `now` as text, and whether it went down. */
function change(now: number, before: number | null) {
  if (before === null) return { text: "no earlier week", down: false, value: null };
  const diff = now - before;
  const pct = before === 0 ? null : (diff / Math.abs(before)) * 100;
  return {
    text: `${diff >= 0 ? "+" : "-"}${money(Math.abs(diff))}${
      pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`
    }`,
    down: diff < 0,
    value: diff,
  };
}

export function WeeklyClient() {
  const { data, isLoading } = useWeekly();
  const { isAdmin } = useProfile();
  const queryClient = useQueryClient();
  const [week, setWeek] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState<"refresh" | "send" | null>(null);
  const sort = useSort<
    "location" | "state" | "net" | "before" | "change" | "company"
  >("net", "desc");

  const selected = week ?? data?.weeks[0] ?? null;

  const view = useMemo(() => {
    if (!data || !selected) return null;
    const previousStart = addDays(selected, -7);
    const hasPrevious = data.weeks.includes(previousStart);
    const locById = new Map(data.locations.map((l) => [l.id, l]));
    const before = new Map(
      data.rows
        .filter((r) => r.week_start === previousStart)
        .map((r) => [r.location_id, r])
    );

    const rows = data.rows
      .filter((r) => r.week_start === selected)
      .map((r) => {
        const prev = before.get(r.location_id);
        return {
          location: locById.get(r.location_id) ?? null,
          location_id: r.location_id,
          state: r.state,
          net: Number(r.net_revenue),
          company: Number(r.company_revenue),
          before: prev ? Number(prev.net_revenue) : null,
        };
      });

    const states = STATE_ORDER.filter(
      (s) =>
        rows.some((r) => r.state === s) ||
        [...before.values()].some((r) => r.state === s)
    );
    const byState = states.map((s) => {
      const now = rows.filter((r) => r.state === s);
      const prev = [...before.values()].filter((r) => r.state === s);
      return {
        state: s,
        locations: now.length,
        net: now.reduce((t, r) => t + r.net, 0),
        company: now.reduce((t, r) => t + r.company, 0),
        before: hasPrevious
          ? prev.reduce((t, r) => t + Number(r.net_revenue), 0)
          : null,
      };
    });

    return { rows, byState, previousStart, hasPrevious };
  }, [data, selected]);

  async function run(kind: "refresh" | "send") {
    setRunning(kind);
    try {
      const res = await fetch("/api/cron/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify: kind === "send" }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "The weekly read did not finish");
        return;
      }
      const read = (body.last?.fetched ?? 0) + (body.previous?.fetched ?? 0);
      const failed =
        (body.last?.errors?.length ?? 0) + (body.previous?.errors?.length ?? 0);
      const left = (body.last?.remaining ?? 0) + (body.previous?.remaining ?? 0);
      const parts = [
        read ? `Read ${read} location-weeks.` : "Figures were already up to date.",
        failed ? `${failed} could not be read.` : "",
        left ? `${left} left; run it again to finish.` : "",
        kind === "send"
          ? body.push
            ? [
                body.sms
                  ? `Texted ${body.sms.sent} ${body.sms.sent === 1 ? "person" : "people"}${
                      body.sms.failed ? `, ${body.sms.failed} failed` : ""
                    }.`
                  : "No texts sent: Twilio is not set up.",
                body.push.sent
                  ? `Phone notification sent to ${body.push.sent} device${body.push.sent === 1 ? "" : "s"}.`
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
            : `Not sent: ${body.push_skipped}.`
          : "",
      ].filter(Boolean);
      toast.success(parts.join(" "));
      queryClient.invalidateQueries({ queryKey: ["weekly-revenue"] });
    } catch {
      toast.error("The weekly read did not finish");
    } finally {
      setRunning(null);
    }
  }

  if (isLoading || !data) {
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
          Weekly revenue is not set up yet. Run database script 010 in
          Supabase, then reload this page.
        </CardContent>
      </Card>
    );
  }

  const adminButtons = isAdmin && (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => run("refresh")}
        disabled={running !== null}
      >
        <RefreshCw
          className={`mr-2 h-4 w-4 ${running === "refresh" ? "animate-spin" : ""}`}
        />
        {running === "refresh" ? "Reading ksys22…" : "Read the last two weeks"}
      </Button>
      <Button
        variant="outline"
        onClick={() => run("send")}
        disabled={running !== null}
      >
        <Send className="mr-2 h-4 w-4" />
        {running === "send" ? "Sending…" : "Send this week's message now"}
      </Button>
    </div>
  );

  // The text list is for admins; the per-device notification is for anyone.
  const notices = (
    <div className="grid gap-4 lg:grid-cols-2">
      {isAdmin && <SmsCard />}
      <NotificationCard />
    </div>
  );

  if (!selected || !view) {
    return (
      <div className="space-y-6">
        {notices}
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-muted-foreground">
              No weekly figures yet. They are read from ksys22 every Monday at
              11:30 AM Eastern, for the week that just ended and the one
              before it.
            </p>
            {isAdmin && <div className="flex justify-center">{adminButtons}</div>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const inState = (s: string) => stateFilter === "all" || s === stateFilter;
  const rows = sortRows(
    view.rows.filter(
      (r) =>
        inState(r.state) &&
        matchesSearch(search, r.location?.location_number, r.location?.name)
    ),
    sort,
    {
      location: (r) => r.location?.location_number,
      state: (r) => r.state,
      net: (r) => r.net,
      before: (r) => r.before,
      change: (r) => (r.before === null ? null : r.net - r.before),
      company: (r) => r.company,
    }
  );
  const states = view.byState.filter((s) => inState(s.state));
  const total = {
    net: rows.reduce((t, r) => t + r.net, 0),
    company: rows.reduce((t, r) => t + r.company, 0),
    before: view.hasPrevious
      ? rows.reduce((t, r) => t + (r.before ?? 0), 0)
      : null,
  };
  const totalChange = change(total.net, total.before);

  return (
    <div className="space-y-6">
      {notices}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={selected} onValueChange={(v) => v && setWeek(v)}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <SelectValue placeholder="Week" />
          </SelectTrigger>
          <SelectContent>
            {data.weeks.map((w) => (
              <SelectItem key={w} value={w}>
                {weekLabel(w)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div className="relative w-full sm:w-[260px]">
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
        {isAdmin && <div className="sm:ml-auto">{adminButtons}</div>}
      </div>

      <p className="text-sm text-muted-foreground">
        Week of {weekLabel(selected)}
        {view.hasPrevious
          ? `, compared with ${weekLabel(view.previousStart)}.`
          : ". The week before it has not been read, so there is nothing to compare with yet."}{" "}
        Net is cash in minus cash out; &quot;ours&quot; is net, less fees,
        times each location&apos;s % share.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {states.map((s) => {
          const c = change(s.net, s.before);
          return (
            <Card key={s.state}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="outline">{s.state}</Badge>
                  {STATE_NAMES[s.state] ?? s.state}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold tabular-nums">{money(s.net)}</div>
                <p
                  className={`text-sm font-medium ${
                    c.value === null
                      ? "text-muted-foreground"
                      : c.down
                        ? "text-red-600"
                        : "text-green-700"
                  }`}
                >
                  {c.value === null ? "" : c.down ? "Down " : "Up "}
                  {c.text.replace(/^[+-]/, "")}
                  {c.value === null ? "" : " on the week before"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {money(s.company)} ours, from {s.locations}{" "}
                  {s.locations === 1 ? "location" : "locations"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By location ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Location" column="location" sort={sort} />
                  <SortHead label="State" column="state" sort={sort} />
                  <SortHead label="Net this week" column="net" sort={sort} align="right" />
                  <SortHead label="Week before" column="before" sort={sort} align="right" />
                  <SortHead label="Change" column="change" sort={sort} align="right" />
                  <SortHead label="Ours" column="company" sort={sort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No locations match.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rows.map((r) => {
                      const c = change(r.net, r.before);
                      return (
                        <TableRow key={r.location_id}>
                          <TableCell>
                            <LocationLinks location={r.location} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.state}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(r.net)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(r.before)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              c.value !== null && c.down ? "text-red-600" : ""
                            }`}
                          >
                            {c.value === null ? "–" : c.text}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(r.company)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell colSpan={2} className="font-medium">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {money(total.net)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {money(total.before)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold tabular-nums ${
                          totalChange.value !== null && totalChange.down
                            ? "text-red-600"
                            : ""
                        }`}
                      >
                        {totalChange.value === null ? "–" : totalChange.text}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {money(total.company)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LocationLinks({ location }: { location: WeeklyLocation | null }) {
  if (!location) return <span className="text-muted-foreground">Removed location</span>;
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
