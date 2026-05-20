"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daysSince } from "@/lib/idle-machines";
import type { IdleLine } from "@/hooks/use-idle-machines";

export function IdleMachinesClient({ lines }: { lines: IdleLine[] }) {
  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No idle machines. Every machine has a recent meter read.
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
            <TableHead className="text-right">Days Stale</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">
                {l.locations
                  ? `${l.locations.location_number} - ${l.locations.name}`
                  : "-"}
              </TableCell>
              <TableCell>{l.position ?? "-"}</TableCell>
              <TableCell>{l.game_name}</TableCell>
              <TableCell className="text-sm">
                {l.last_read_date ?? "Never"}
              </TableCell>
              <TableCell className="text-right font-medium text-orange-600">
                {l.last_read_date ? daysSince(l.last_read_date) : "Never read"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
