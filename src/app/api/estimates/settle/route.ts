import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import type { EstimateDetails } from "@/types/database";

export const maxDuration = 60;

const STATES = ["TX", "VA", "FL"];

/**
 * Take the estimate-versus-actual snapshot for one settlement sheet.
 *
 * For each state on the sheet, every cleared period that no earlier sheet
 * has claimed becomes part of this sheet's estimate. Active locations in
 * the state with nothing cleared since the last sheet are listed as not
 * cleared, with their running (open-period) figures.
 *
 * Safe to call again for the same statement: its earlier claim is released
 * first, so the result is recalculated from scratch.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const statementId = String(body.statement_id ?? "").trim();
  const period = typeof body.period === "string" ? body.period : null;
  const sheetDate =
    typeof body.sheet_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.sheet_date)
      ? body.sheet_date
      : null;
  const collections: { state: string; amount: number }[] = Array.isArray(
    body.collections
  )
    ? body.collections
        .map((c: { state?: unknown; amount?: unknown }) => ({
          state: String(c.state ?? "").toUpperCase(),
          amount: Number(c.amount) || 0,
        }))
        .filter((c: { state: string }) => STATES.includes(c.state))
    : [];

  if (!statementId || collections.length === 0) {
    return NextResponse.json(
      { error: "statement_id and at least one state collection are required" },
      { status: 400 }
    );
  }

  const service = createAdminClient();

  // Release anything this statement claimed before, then start clean.
  const { error: releaseError } = await service
    .from("cleared_periods")
    .update({ settlement_ref: null })
    .eq("settlement_ref", statementId);
  if (releaseError) {
    return NextResponse.json({ error: releaseError.message }, { status: 500 });
  }
  await service
    .from("settlement_estimates")
    .delete()
    .eq("statement_id", statementId);

  const actualByState = new Map<string, number>();
  for (const c of collections) {
    actualByState.set(c.state, (actualByState.get(c.state) ?? 0) + c.amount);
  }

  const results = [];
  for (const [state, actual] of actualByState) {
    const { data: locations, error: locError } = await service
      .from("locations")
      .select("id, location_number, name, revenue_url, percentage_share, fees, close_date")
      .eq("state", state)
      .order("location_number");
    if (locError) {
      return NextResponse.json({ error: locError.message }, { status: 500 });
    }
    const locs = locations ?? [];
    const locIds = locs.map((l) => l.id);
    const locById = new Map(locs.map((l) => [l.id, l]));

    const { data: open } = locIds.length
      ? await service
          .from("cleared_periods")
          .select("*")
          .in("location_id", locIds)
          .is("settlement_ref", null)
          .order("cleared_on")
      : { data: [] };
    const periods = open ?? [];

    if (periods.length) {
      const { error: claimError } = await service
        .from("cleared_periods")
        .update({ settlement_ref: statementId })
        .in(
          "id",
          periods.map((p) => p.id)
        );
      if (claimError) {
        return NextResponse.json({ error: claimError.message }, { status: 500 });
      }
    }

    const { data: running } = locIds.length
      ? await service
          .from("revenue_records")
          .select("location_id, period_start, net_revenue, company_revenue, fetched_at")
          .in("location_id", locIds)
      : { data: [] };
    const runningByLoc = new Map((running ?? []).map((r) => [r.location_id, r]));

    const clearedLocIds = new Set(periods.map((p) => p.location_id));
    const details: EstimateDetails = {
      cleared: periods.map((p) => {
        const l = locById.get(p.location_id);
        return {
          location_number: l?.location_number ?? "",
          name: l?.name ?? "",
          period_start: p.period_start,
          period_end: p.period_end,
          cleared_on: p.cleared_on,
          net_revenue: Number(p.net_revenue),
          share_pct: Number(p.company_share_pct),
          fee_amount: Number(p.fee_amount),
          estimate: Number(p.company_revenue),
          source: p.source,
        };
      }),
      not_cleared: locs
        .filter((l) => !l.close_date && l.revenue_url && !clearedLocIds.has(l.id))
        .map((l) => {
          const r = runningByLoc.get(l.id);
          return {
            location_number: l.location_number,
            name: l.name,
            period_start: r?.period_start ?? null,
            running_net: r ? Number(r.net_revenue) : null,
            running_estimate: r ? Number(r.company_revenue) : null,
            share_pct: Number(l.percentage_share),
            fetched_at: r?.fetched_at ?? null,
          };
        }),
      no_link: locs
        .filter((l) => !l.close_date && !l.revenue_url)
        .map((l) => ({ location_number: l.location_number, name: l.name })),
    };

    const estimate =
      Math.round(details.cleared.reduce((t, c) => t + c.estimate, 0) * 100) / 100;

    const row = {
      statement_id: statementId,
      state,
      statement_period: period,
      sheet_date: sheetDate,
      estimate,
      actual,
      cleared_count: new Set(periods.map((p) => p.location_id)).size,
      not_cleared_count: details.not_cleared.length,
      details,
    };
    const { error: saveError } = await service
      .from("settlement_estimates")
      .insert(row);
    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }
    results.push(row);
  }

  await auth.supabase.from("audit_log").insert({
    action: "settlement_estimated",
    performed_by: auth.user.id,
    details: {
      statement_id: statementId,
      states: results.map((r) => ({
        state: r.state,
        estimate: r.estimate,
        actual: r.actual,
      })),
    },
  });

  return NextResponse.json({ estimates: results });
}

/** Release a statement's claim (used when the statement is deleted). */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const statementId = request.nextUrl.searchParams.get("statement_id")?.trim();
  if (!statementId) {
    return NextResponse.json({ error: "statement_id is required" }, { status: 400 });
  }

  const service = createAdminClient();
  const { error } = await service
    .from("cleared_periods")
    .update({ settlement_ref: null })
    .eq("settlement_ref", statementId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await service
    .from("settlement_estimates")
    .delete()
    .eq("statement_id", statementId);

  return NextResponse.json({ released: true });
}
