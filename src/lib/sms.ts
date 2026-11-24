import type { SupabaseClient } from "@supabase/supabase-js";

export interface SmsRecipient {
  name: string;
  /** E.164, e.g. +14045551234 */
  phone: string;
}

export const MAX_SMS_RECIPIENTS = 10;

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** A sending number (+1...) or a Messaging Service SID (MG...). */
  from: string;
}

/**
 * Twilio settings from the environment:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM, which is either
 *   the sending phone number (+14045551234) or a Messaging Service SID (MG...).
 */
function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

/** Which Twilio settings are still missing, for the admin screen. */
export function missingTwilioSettings(): string[] {
  return ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"].filter(
    (name) => !process.env[name]?.trim()
  );
}

export const smsConfigured = () => twilioConfig() !== null;

/**
 * A phone number in E.164 form, or null if it is not usable. Ten digits are
 * read as a US number; anything else must start with + and a country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = String(input ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** The people who get the Monday text. Kept in app_config (service role only). */
export async function getSmsRecipients(
  service: SupabaseClient
): Promise<SmsRecipient[]> {
  const { data } = await service
    .from("app_config")
    .select("value")
    .eq("key", "sms_recipients")
    .maybeSingle();
  const list = (data?.value as { recipients?: unknown } | undefined)?.recipients;
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => ({
      name: String((r as SmsRecipient)?.name ?? "").slice(0, 60),
      phone: normalizePhone(String((r as SmsRecipient)?.phone ?? "")) ?? "",
    }))
    .filter((r) => r.phone);
}

export async function saveSmsRecipients(
  service: SupabaseClient,
  recipients: SmsRecipient[]
): Promise<void> {
  const { error } = await service.from("app_config").upsert({
    key: "sms_recipients",
    value: { recipients },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export interface SmsSendResult {
  ok: boolean;
  /** Twilio's explanation when it refused the message. */
  error?: string;
}

/** Send one text through Twilio. Never throws; failures come back in the result. */
export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
  const config = twilioConfig();
  if (!config) return { ok: false, error: "Twilio is not set up" };

  const form = new URLSearchParams({ To: to, Body: body });
  if (config.from.startsWith("MG")) form.set("MessagingServiceSid", config.from);
  else form.set("From", config.from);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        config.accountSid
      )}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      }
    );
    if (res.ok) return { ok: true };
    const detail = (await res.json().catch(() => null)) as
      | { message?: string; code?: number }
      | null;
    return {
      ok: false,
      error:
        `${detail?.message ?? `Twilio answered ${res.status}`}` +
        (detail?.code ? ` (Twilio code ${detail.code})` : ""),
    };
  } catch (err) {
    return { ok: false, error: `Could not reach Twilio: ${String(err)}` };
  }
}

export interface SmsBatchResult {
  sent: number;
  failed: number;
  errors: { name: string; error: string }[];
}

/** Send the same text to every recipient on the list. */
export async function sendSmsToAll(
  service: SupabaseClient,
  body: string
): Promise<SmsBatchResult> {
  const result: SmsBatchResult = { sent: 0, failed: 0, errors: [] };
  for (const recipient of await getSmsRecipients(service)) {
    const sent = await sendSms(recipient.phone, body);
    if (sent.ok) result.sent++;
    else {
      result.failed++;
      result.errors.push({
        name: recipient.name || "Recipient",
        error: sent.error ?? "Not sent",
      });
    }
  }
  return result;
}
