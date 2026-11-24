import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { refreshLocationRevenue } from "@/lib/clears";
import { ensureMonthlySnapshot } from "@/lib/snapshots";

export const maxDuration = 300;

/** Stop starting new locations after this long so the run ends cleanly. */
const TIME_BUDGET_MS = 240_000;
const CONCURRENCY = 3;

interface JobLocation {
  id: string;
  location_number: string;
  revenue_url: string;
  percentage_share: number;
  fees: number;
}

/**
 * The daily background job:
 *  1. takes the month-end snapshot when the month that just ended has none;
 *  2. refreshes every active location's ksys22 revenue, which records a
 *     cleared period for any location that was cleared since the last run.
 *
 * Locations are processed oldest-fetched first, a few at a time, so if the
 * time budget runs out the remainder is picked up first on the next run.
 */
async function runDailyJob(performedBy: string | null) {
  const started = Date.now();
  const service = createAdminClient();

  let snapshot: Awaited<ReturnType<typeof ensureMonthlySnapshot>> | null = null;
  let snapshotError: string | null = null;
  try {
    snapshot = await ensureMonthlySnapshot(service);
  } catch (err) {
    snapshotError = String(err);
    console.error("Monthly snapshot failed:", err);
  }

  const [{ data: locations }, { data: records }] = await Promise.all([
    service
      .from("locations")
      .select("id, location_number, revenue_url, percentage_share, fees")
      .not("revenue_url", "is", null)
      .is("close_date", null),
    service.from("revenue_records").select("location_id, fetched_at"),
  ]);

  const lastFetched = new Map<string, string>();
  for (const r of records ?? []) {
    const prev = lastFetched.get(r.location_id);
    if (!prev || r.fetched_at > prev) lastFetched.set(r.location_id, r.fetched_at);
  }
  const queue = ((locations ?? []) as JobLocation[]).sort((a, b) =>
    (lastFetched.get(a.id) ?? "").localeCompare(lastFetched.get(b.id) ?? "")
  );

  let refreshed = 0;
  let skipped = 0;
  const cleared: string[] = [];
  const errors: { location_number: string; error: string }[] = [];

  async function worker() {
    while (queue.length > 0) {
      if (Date.now() - started > TIME_BUDGET_MS) return;
      const loc = queue.shift()!;
      try {
        const result = await refreshLocationRevenue(service, loc);
        refreshed++;
        if (result.cleared) cleared.push(loc.location_number);
      } catch (err) {
        errors.push({ location_number: loc.location_number, error: String(err) });
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  skipped = queue.length;

  const summary = {
    snapshot,
    snapshot_error: snapshotError,
    refreshed,
    cleared,
    errors,
    skipped,
    seconds: Math.round((Date.now() - started) / 1000),
  };

  await service.from("audit_log").insert({
    action: "daily_job_run",
    performed_by: performedBy,
    details: summary,
  });

  return summary;
}

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set" },
      { status: 500 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await runDailyJob(null));
  } catch (err) {
    console.error("Daily job failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** Lets an admin run the same job on demand from the app. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await runDailyJob(auth.user.id));
  } catch (err) {
    console.error("Daily job failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
