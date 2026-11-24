import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { getSmsRecipients, normalizePhone, sendSms, smsConfigured } from "@/lib/sms";

/**
 * Send a test text to ONE number on the recipient list. Admins only, and only
 * to numbers already saved, so this cannot be used to text arbitrary people.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!smsConfigured()) {
    return NextResponse.json({ error: "Twilio is not set up yet" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ""));
  const recipients = await getSmsRecipients(createAdminClient());
  const recipient = recipients.find((r) => r.phone === phone);
  if (!recipient) {
    return NextResponse.json(
      { error: "That number is not on the saved list" },
      { status: 400 }
    );
  }

  const result = await sendSms(
    recipient.phone,
    "Game Machine Manager: test message. The Monday revenue text will come from this number."
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ sent: true });
}
