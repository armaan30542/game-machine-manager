"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, MapPin, ArrowLeftRight, Package } from "lucide-react";
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
import { useProfile } from "@/hooks/use-profile";
import { useSnapshotList, useMonthlyChanges } from "@/hooks/use-monthly-changes";
import {
  monthLabel,
  type FieldChange,
  type LocationChange,
  type MachineChange,
} from "@/lib/snapshot-diff";

const KIND_META: Record<string, { label: string; color: string }> = {
  added: { label: "Added", color: "bg-green-100 text-green-800" },
  new: { label: "New", color: "bg-green-100 text-green-800" },
  placed: { label: "Placed", color: "bg-green-100 text-green-800" },
  closed: { label: "Closed", color: "bg-red-100 text-red-800" },
  deleted: { label: "Deleted", color: "bg-red-100 text-red-800" },
  removed: { label: "Removed", color: "bg-orange-100 text-orange-800" },
  reopened: { label: "Reopened", color: "bg-blue-100 text-blue-800" },
  moved: { label: "Moved", color: "bg-blue-100 text-blue-800" },
  edited: { label: "Edited", color: "bg-slate-100 text-slate-800" },
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

type StateFilter = "all" | "TX" | "VA" | "FL";

function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind] ?? { label: kind, color: "bg-slate-100" };
  return (
    <Badge variant="outline" className={`border-0 ${meta.color}`}>
      {meta.label}
    </Badge>
  );
}

function Fields({ fields }: { fields: FieldChange[] }) {
  if (!fields.length) return <span className="text-muted-foreground">–</span>;
  return (
    <ul className="space-y-0.5">
      {fields.map((f) => (
        <li key={f.field}>
          <span className="font-medium">{f.label}:</span>{" "}
          <span className="text-muted-foreground">{f.before}</span> →{" "}
          <span className="break-all">{f.after}</span>
        </li>
      ))}
    </ul>
  );
}

export function MonthlyChangesClient() {
  const { isAdmin } = useProfile();
  const queryClient = useQueryClient();
  const { data: list, isLoading: listLoading } = useSnapshotList();
  const snapshots = useMemo(() => list?.snapshots ?? [], [list]);
  const [selection, setSelection] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [taking, setTaking] = useState(false);

  // Months that can be reported: a snapshot with an earlier one to compare.
  const reportable = snapshots.slice(0, -1);

  useEffect(() => {
    if (selection || snapshots.length === 0) return;
    setSelection(reportable.length > 0 ? reportable[0].month : "current");
  }, [snapshots, reportable, selection]);

  const { data: changes, isLoading } = useMonthlyChanges(selection, snapshots);

  async function takeSnapshot() {
    setTaking(true);
    try {
      const res = await fetch("/api/cron/daily", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "The snapshot was not taken");
      } else if (body.snapshot_error) {
        toast.error(body.snapshot_error);
      } else {
        toast.success(
          body.snapshot?.taken
            ? `Snapshot saved for ${monthLabel(body.snapshot.month)}.`
            : "A snapshot for last month already exists."
        );
        queryClient.invalidateQueries({ queryKey: ["monthly-snapshots"] });
      }
    } catch {
      toast.error("The snapshot was not taken");
    } finally {
      setTaking(false);
    }
  }

  if (listLoading || !list) return <Skeleton className="h-64 w-full" />;

  if (list.notInstalled) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Monthly snapshots are not set up yet. Run database script 009 in
          Supabase, then reload this page.
        </CardContent>
      </Card>
    );
  }

  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground">
            No snapshot has been taken yet. The daily job takes one after each
            month ends; the first one is the starting point that later months
            are compared against.
          </p>
          {isAdmin && (
            <Button onClick={takeSnapshot} disabled={taking}>
              <Camera className="mr-2 h-4 w-4" />
              {taking ? "Taking snapshot…" : "Take the first snapshot now"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const inState = (s: string) => stateFilter === "all" || s === stateFilter;
  const diff = changes?.diff;
  const locations = (diff?.locations ?? []).filter((c) => inState(c.state));
  const machines = (diff?.machines ?? []).filter((c) => inState(c.state));
  const dispensers = (diff?.dispensers ?? []).filter((c) => inState(c.state));
  const count = (rows: (LocationChange | MachineChange)[], kinds: string[]) =>
    rows.filter((r) => kinds.includes(r.kind)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={selection ?? ""} onValueChange={(v) => v && setSelection(v)}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">This month so far</SelectItem>
            {reportable.map((s) => (
              <SelectItem key={s.month} value={s.month}>
                {monthLabel(s.month)}
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
      </div>

      {changes && (
        <p className="text-sm text-muted-foreground">
          Comparing the snapshot taken {day(changes.from.taken_at)}
          {changes.from.is_baseline ? " (the starting snapshot)" : ""} with{" "}
          {changes.to
            ? `the one taken ${day(changes.to.taken_at)}`
            : "the data as it is now"}
          .
          {changes.from.is_baseline &&
            " Changes made before the starting snapshot are not included."}
        </p>
      )}

      {isLoading || !diff ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Summary
              title="Active locations"
              value={`${diff.counts.locationsBefore} → ${diff.counts.locationsAfter}`}
              detail={`${count(locations, ["added"])} added, ${count(locations, ["closed"])} closed`}
            />
            <Summary
              title="Location edits"
              value={String(count(locations, ["edited"]))}
              detail="Share %, fees, contract, links, contacts"
            />
            <Summary
              title="Deployed machines"
              value={`${diff.counts.deployedBefore} → ${diff.counts.deployedAfter}`}
              detail={`${count(machines, ["placed", "new"])} placed or new, ${count(machines, ["removed", "deleted"])} removed`}
            />
            <Summary
              title="Machines in inventory"
              value={`${diff.counts.inventoryBefore} → ${diff.counts.inventoryAfter}`}
              detail={`${count(machines, ["moved"])} moved between locations`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5" />
                Location changes ({locations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>What changed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.length === 0 ? (
                      <Empty span={4} text="No location changes." />
                    ) : (
                      locations.map((c, i) => (
                        <TableRow key={`${c.id}-${c.kind}-${i}`}>
                          <TableCell className="font-medium">
                            {c.location_number} - {c.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.state}</Badge>
                          </TableCell>
                          <TableCell>
                            <KindBadge kind={c.kind} />
                          </TableCell>
                          <TableCell className="whitespace-normal text-sm">
                            <Fields fields={c.fields} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ArrowLeftRight className="h-5 w-5" />
                Machine changes ({machines.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>What changed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machines.length === 0 ? (
                      <Empty span={5} text="No machine changes." />
                    ) : (
                      machines.map((c, i) => (
                        <TableRow key={`${c.id}-${c.kind}-${i}`}>
                          <TableCell className="font-medium">{c.machine}</TableCell>
                          <TableCell>
                            <KindBadge kind={c.kind} />
                          </TableCell>
                          <TableCell>{c.kind === "edited" ? "" : c.from || "–"}</TableCell>
                          <TableCell>{c.to || "–"}</TableCell>
                          <TableCell className="whitespace-normal text-sm">
                            <Fields fields={c.fields} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" />
                Dispenser changes ({dispensers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispenser</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispensers.length === 0 ? (
                      <Empty span={4} text="No dispenser changes." />
                    ) : (
                      dispensers.map((c, i) => (
                        <TableRow key={`${c.id}-${c.kind}-${i}`}>
                          <TableCell className="font-medium">{c.dispenser}</TableCell>
                          <TableCell>
                            <KindBadge kind={c.kind} />
                          </TableCell>
                          <TableCell>{c.from || "–"}</TableCell>
                          <TableCell>{c.to || "–"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Summary({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Empty({ span, text }: { span: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={span} className="py-8 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
