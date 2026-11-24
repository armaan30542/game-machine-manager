import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { sendPush } from "@/lib/push";
import { sendSmsToAll, smsConfigured } from "@/lib/sms";
import {
  WEEKLY_SEND_HOUR,
  businessHour,
  fetchWeek,
  lastTwoWeeks,
  stateTotals,
  weeklyMessage,
} from "@/lib/weekly";

export const maxDuration = 300;

/** Stop starting new locations after this long so the run ends cleanly. */
const TIME_BUDGET_MS = 240_000;

/**
 * The Monday job: read last week's revenue (Monday to Sunday) for every
 * location, make sure the week before it is stored too, and send one
 * notification comparing the two, by state.
 *
 * notify:
 *   "once"  - send if this week's notification has not gone out yet (cron);
 *   "now"   - send regardless (an admin asked for it);
 *   "never" - only refresh the stored figures.
 */
async function runWeeklyJob(
  performedBy: string | null,
  notify: "once" | "now" | "never"
) {
  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const service = createAdminClient();
  const weeks = lastTwoWeeks();

  const last = await fetchWeek(service, weeks.last.start, deadline, performedBy);
  const previous = await fetchWeek(
    service,
    weeks.previous.start,
    deadline,
    performedBy
  );

  const sentKey = `weekly_push_sent:${weeks.last.start}`;
  const { data: sentRow } = await service
    .from("app_config")
    .select("key")
    .eq("key", sentKey)
    .maybeSingle();

  const current = await stateTotals(service, weeks.last.start);
  const before = await stateTotals(service, weeks.previous.start);

  let push: Awaited<ReturnType<typeof sendPush>> | null = null;
  let sms: Awaited<ReturnType<typeof sendSmsToAll>> | null = null;
  let pushSkipped: string | null = null;
  if (notify === "never") {
    pushSkipped = "not requested";
  } else if (notify === "once" && sentRow) {
    pushSkipped = "already sent for this week";
  } else if (last.remaining > 0) {
    pushSkipped = "last week is not fully read yet";
  } else if (current.size === 0) {
    pushSkipped = "no revenue was read for last week";
  } else {
    const message = weeklyMessage(
      weeks.last.start,
      current,
      before,
      last.errors.length
    );
    // Texts go to the saved recipient list; the phone notification goes to
    // any device that has it switched on. Names are left out of the log.
    if (smsConfigured()) {
      sms = await sendSmsToAll(service, `${message.title}\n${message.body}`);
    }
    push = await sendPush(service, {
      ...message,
      url: "/weekly",
      tag: "weekly-revenue",
    });
    await service.from("app_config").upsert({
      key: sentKey,
      value: {
        sent_at: new Date().toISOString(),
        texts_sent: sms?.sent ?? 0,
        texts_failed: sms?.failed ?? 0,
        push,
      },
      updated_at: new Date().toISOString(),
    });
  }

  const summary = {
    week_start: weeks.last.start,
    last,
    previous,
    push,
    sms: sms && {
      sent: sms.sent,
      failed: sms.failed,
      errors: sms.errors.map((e) => e.error),
    },
    push_skipped: pushSkipped,
    seconds: Math.round((Date.now() - started) / 1000),
  };

  await service.from("audit_log").insert({
    action: "weekly_job_run",
    performed_by: performedBy,
    details: summary,
  });

  return summary;
}

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vercel schedules in UTC and knows nothing of daylight saving, so the
  // job is scheduled twice (15:30 and 16:30 UTC). Only the firing that
  // lands in the 11 o'clock hour Eastern does the work.
  const hour = businessHour();
  if (hour !== WEEKLY_SEND_HOUR) {
    return NextResponse.json({
      skipped: `It is ${hour}:00 Eastern; the weekly job runs in the ${WEEKLY_SEND_HOUR}:00 hour.`,
    });
  }

  try {
    return NextResponse.json(await runWeeklyJob(null, "once"));
  } catch (err) {
    console.error("Weekly job failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** Lets an admin refresh the figures, and optionally send the notification. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(
      await runWeeklyJob(auth.user.id, body?.notify === true ? "now" : "never")
    );
  } catch (err) {
    console.error("Weekly job failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
