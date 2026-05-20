"use client";

import { Fragment, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "lucide-react";
import { daysSince } from "@/lib/idle-machines";
import type { IdleLine } from "@/hooks/use-idle-machines";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function staleLabel(line: IdleLine): string {
  if (!line.last_read_date) return "Never read";
  const d = daysSince(line.last_read_date);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function IdleMachinesClient({ lines }: { lines: IdleLine[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No zero-revenue machines. Every machine earned money in the latest
          period.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead>Pos</TableHead>
            <TableHead>Game</TableHead>
            <TableHead>Last Read</TableHead>
            <TableHead className="text-right">Net Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            const isExpanded = expandedId === l.id;
            const net = Number(l.net_revenue);
            return (
              <Fragment key={l.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId(isExpanded ? null : l.id)}
                >
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      {l.locations
                        ? `${l.locations.location_number} - ${l.locations.name}`
                        : "-"}
                    </span>
                  </TableCell>
                  <TableCell>{l.position ?? "-"}</TableCell>
                  <TableCell>{l.game_name}</TableCell>
                  <TableCell className="text-sm">
                    {l.last_read_date ?? "Never"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${net < 0 ? "text-red-600" : "text-orange-600"}`}
                  >
                    {fmt(net)}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30">
                      <IdleBreakdown line={l} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function IdleBreakdown({ line }: { line: IdleLine }) {
  const net = Number(line.net_revenue);
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field
        label="Location"
        value={
          line.locations
            ? `${line.locations.location_number} - ${line.locations.name}`
            : "-"
        }
      />
      <Field
        label="Position"
        value={line.position != null ? String(line.position) : "-"}
      />
      <Field label="Game" value={line.game_name} />
      <Field label="ksys Game ID" value={line.ksys_game_id ?? "-"} />
      <Field label="Last Meter Read" value={line.last_read_date ?? "Never read"} />
      <Field label="Meter Age" value={staleLabel(line)} />
      <Field label="Last Period Cash In" value={fmt(Number(line.cash_in))} />
      <Field label="Last Period Cash Out" value={fmt(Number(line.cash_out))} />
      <Field
        label="Last Period Net"
        value={fmt(net)}
        valueClass={net < 0 ? "text-red-600" : ""}
      />
      <Field
        label="Data Fetched"
        value={new Date(line.created_at).toLocaleString()}
      />
    </div>
  );
}

function Field({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-sm font-medium ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
