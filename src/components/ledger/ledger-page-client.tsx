"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Skeleton } from "@/components/ui/skeleton";
import { mountLedger } from "./ledger-app";
import "./ledger.css";

type Doc = Record<string, unknown>;
interface Snapshot {
  docs: { id: string; exists: true; data: () => Doc }[];
}
type Listener = (snap: Snapshot) => void;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * The ledger UI is a framework-free module (ledger-app.js). This builds the
 * capabilities it needs on top of the app:
 *   db        -> the ledger_docs table (admin-only by RLS)
 *   assets    -> the private 'ledger' storage bucket, via /api/ledger/image
 *   sample    -> Claude reading an image, via /api/ledger/read-image
 *   estimates -> clear checks and the estimate snapshot for a statement
 */
function buildCapabilities() {
  const supabase = createClient();
  const listeners = new Map<string, Set<Listener>>();

  async function readCollection(collection: string): Promise<Snapshot> {
    const { data, error } = await supabase
      .from("ledger_docs")
      .select("id, data")
      .eq("collection", collection)
      .order("id");
    if (error) throw { code: "unavailable", message: error.message };
    return {
      docs: (data ?? []).map((row) => ({
        id: row.id as string,
        exists: true as const,
        data: () => row.data as Doc,
      })),
    };
  }

  async function notify(collection: string) {
    const set = listeners.get(collection);
    if (!set || set.size === 0) return;
    try {
      const snap = await readCollection(collection);
      set.forEach((fn) => fn(snap));
    } catch {
      // The write itself succeeded; the next successful read will catch up.
    }
  }

  const fail = (message: string) => ({ code: "invalid_argument", message });

  const db = {
    collection(collection: string) {
      return {
        onSnapshot(next: Listener, error?: (e: unknown) => void) {
          let set = listeners.get(collection);
          if (!set) listeners.set(collection, (set = new Set()));
          set.add(next);
          readCollection(collection).then(
            (snap) => {
              if (set!.has(next)) next(snap);
            },
            (e) => error?.(e)
          );
          return () => set!.delete(next);
        },
      };
    },
    doc(path: string) {
      const [collection, id] = path.split("/");
      const read = async () => {
        const { data } = await supabase
          .from("ledger_docs")
          .select("data")
          .eq("collection", collection)
          .eq("id", id)
          .maybeSingle();
        return (data?.data as Doc | undefined) ?? null;
      };
      const write = async (data: Doc) => {
        const { error } = await supabase.from("ledger_docs").upsert({
          collection,
          id,
          data,
          updated_at: new Date().toISOString(),
        });
        if (error) throw fail(error.message);
        await notify(collection);
      };
      return {
        set: write,
        async update(patch: Doc) {
          const current = await read();
          if (!current) throw fail("Document does not exist");
          await write({ ...current, ...patch });
        },
        async delete() {
          const { error } = await supabase
            .from("ledger_docs")
            .delete()
            .eq("collection", collection)
            .eq("id", id);
          if (error) throw fail(error.message);
          await notify(collection);
        },
        onSnapshot(next: (snap: { exists: boolean; data: () => Doc | undefined }) => void) {
          read().then((data) =>
            next({ exists: !!data, data: () => data ?? undefined })
          );
          return () => {};
        },
      };
    },
  };

  const assets = {
    async upload(file: File): Promise<{ id: string }> {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/ledger/image", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.id) throw { code: "upstream_error", message: body.error };
      return { id: body.id };
    },
  };

  const sample = {
    async json(
      prompt: string,
      options: { images: File[]; signal?: AbortSignal }
    ): Promise<unknown> {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("image", options.images[0]);
      let res: Response;
      try {
        res = await fetch("/api/ledger/read-image", {
          method: "POST",
          body: form,
          signal: options.signal,
        });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw { code: "cancelled" };
        throw { code: "upstream_error" };
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw { code: body.code ?? "upstream_error", message: body.error };
      return body.result;
    },
  };

  const downloads = {
    async save({ filename, data }: { filename: string; data: string }) {
      const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { status: "saved" as const };
    },
  };

  const estimates = {
    async get(statementId: string) {
      const { data, error } = await supabase
        .from("settlement_estimates")
        .select("*")
        .eq("statement_id", statementId)
        .order("state");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    /** Refresh ksys22 for every active location in the given states. */
    async refresh(states: string[], onProgress: (done: number, total: number) => void) {
      const { data: locations } = await supabase
        .from("locations")
        .select("id")
        .in("state", states)
        .is("close_date", null)
        .not("revenue_url", "is", null);
      const list = locations ?? [];
      let done = 0;
      onProgress(done, list.length);
      // One at a time: ksys22 returns empty reports to overlapping sign-ins.
      for (const loc of list) {
        try {
          await fetch("/api/revenue/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ location_id: loc.id }),
          });
        } catch {
          // One location failing must not stop the settlement.
        }
        onProgress(++done, list.length);
      }
    },
    async settle(payload: Doc) {
      const res = await fetch("/api/estimates/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The estimate was not saved.");
      return body.estimates ?? [];
    },
    async release(statementId: string) {
      await fetch(
        `/api/estimates/settle?statement_id=${encodeURIComponent(statementId)}`,
        { method: "DELETE" }
      );
    },
  };

  return {
    db,
    assets,
    sample,
    downloads,
    estimates,
    canWrite: true,
    imageTypes: IMAGE_TYPES,
    imageUrl: (id: string) => `/api/ledger/image/${encodeURIComponent(id)}`,
  };
}

export function LedgerPageClient() {
  const { profile, isLoading, isAdmin } = useProfile();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAdmin || !rootRef.current) return;
    return mountLedger(rootRef.current, buildCapabilities());
  }, [isAdmin]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settlement Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Manek&apos;s monthly sheets: collections, expenses, paybacks and each
          partner&apos;s share, with the arithmetic checked.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !profile || !isAdmin ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          The ledger holds partner payouts and is only open to admins.
        </p>
      ) : (
        <div ref={rootRef} className="ledger-root" />
      )}
    </div>
  );
}
