import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import {
  MAX_SMS_RECIPIENTS,
  getSmsRecipients,
  missingTwilioSettings,
  normalizePhone,
  saveSmsRecipients,
  type SmsRecipient,
} from "@/lib/sms";

/** Who gets the Monday text, and whether Twilio is set up. Admins only. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const recipients = await getSmsRecipients(createAdminClient());
  return NextResponse.json({
    recipients,
    missing_settings: missingTwilioSettings(),
  });
}

/** Replace the list of recipients. Admins only. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.recipients)) {
    return NextResponse.json({ error: "recipients is required" }, { status: 400 });
  }
  if (body.recipients.length > MAX_SMS_RECIPIENTS) {
    return NextResponse.json(
      { error: `At most ${MAX_SMS_RECIPIENTS} recipients` },
      { status: 400 }
    );
  }

  const cleaned: SmsRecipient[] = [];
  for (const entry of body.recipients) {
    const phone = normalizePhone(String(entry?.phone ?? ""));
    if (!phone) {
      return NextResponse.json(
        {
          error: `"${String(entry?.phone ?? "")}" is not a phone number. Use 10 digits, or + and the country code.`,
        },
        { status: 400 }
      );
    }
    if (cleaned.some((r) => r.phone === phone)) continue;
    cleaned.push({ name: String(entry?.name ?? "").trim().slice(0, 60), phone });
  }

  try {
    await saveSmsRecipients(createAdminClient(), cleaned);
  } catch (err) {
    console.error("Saving SMS recipients failed:", err);
    return NextResponse.json({ error: "Could not save the list" }, { status: 500 });
  }
  return NextResponse.json({ recipients: cleaned });
}
