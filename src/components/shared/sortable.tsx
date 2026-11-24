"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
  /** Sort by this column; a second click on the same column reverses it. */
  toggle: (key: K) => void;
}

export function useSort<K extends string>(
  initialKey: K,
  initialDir: SortDir = "asc"
): SortState<K> {
  const [state, setState] = useState<{ key: K; dir: SortDir }>({
    key: initialKey,
    dir: initialDir,
  });
  return {
    ...state,
    toggle: (key) =>
      setState((s) =>
        s.key === key
          ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
          : { key, dir: "asc" }
      ),
  };
}

/** Sorted copy of `rows`. Blank values always sort last. */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: { key: K; dir: SortDir },
  accessors: Record<K, (row: T) => SortValue>
): T[] {
  const get = accessors[sort.key];
  const blank = (v: SortValue) => v === null || v === undefined || v === "";
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (blank(x) && blank(y)) return 0;
    if (blank(x)) return 1;
    if (blank(y)) return -1;
    const cmp =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true });
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

/** True when every word of `query` appears somewhere in `fields`. */
export function matchesSearch(query: string, ...fields: SortValue[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fields
    .filter((f) => f !== null && f !== undefined)
    .join(" ")
    .toLowerCase();
  return words.every((w) => text.includes(w));
}

export function SortHead<K extends string>({
  label,
  column,
  sort,
  align = "left",
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  align?: "left" | "right";
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => sort.toggle(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} />
      </button>
    </TableHead>
  );
}
