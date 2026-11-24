import { generateVAPIDKeys, sendNotification } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * The key pair that signs push messages (VAPID). The app creates it once and
 * keeps it in app_config, which only the service role can read, so there is
 * nothing to configure. Devices subscribe against the public key; changing
 * the pair would silently disconnect every subscribed device.
 */
export async function getVapidKeys(service: SupabaseClient): Promise<VapidKeys> {
  const { data, error } = await service
    .from("app_config")
    .select("value")
    .eq("key", "vapid_keys")
    .maybeSingle();
  if (error) throw new Error(`Could not read push keys: ${error.message}`);

  const stored = data?.value as Partial<VapidKeys> | undefined;
  if (stored?.publicKey && stored?.privateKey) {
    return { publicKey: stored.publicKey, privateKey: stored.privateKey };
  }

  const fresh = generateVAPIDKeys();
  // If two requests race to create the pair, keep whichever landed first.
  await service
    .from("app_config")
    .upsert(
      { key: "vapid_keys", value: fresh },
      { onConflict: "key", ignoreDuplicates: true }
    );
  const { data: again, error: againError } = await service
    .from("app_config")
    .select("value")
    .eq("key", "vapid_keys")
    .single();
  if (againError) throw new Error(`Could not save push keys: ${againError.message}`);
  return again.value as VapidKeys;
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Send a notification to every subscribed device, or only to one person's
 * devices when `userId` is given. Devices that have unsubscribed (the push
 * service answers 404 or 410) are removed.
 */
export async function sendPush(
  service: SupabaseClient,
  payload: PushPayload,
  userId?: string
): Promise<PushResult> {
  const keys = await getVapidKeys(service);
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@manek.mycoam.com";

  let query = service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (userId) query = query.eq("user_id", userId);
  const { data: subscriptions, error } = await query;
  if (error) throw new Error(`Could not read devices: ${error.message}`);

  const result: PushResult = { sent: 0, failed: 0, removed: 0 };
  const body = JSON.stringify(payload);

  for (const sub of subscriptions ?? []) {
    try {
      await sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        {
          TTL: 60 * 60 * 24,
          vapidDetails: {
            subject,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
          },
        }
      );
      result.sent++;
      await service
        .from("push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), last_error: null })
        .eq("id", sub.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await service.from("push_subscriptions").delete().eq("id", sub.id);
        result.removed++;
      } else {
        result.failed++;
        await service
          .from("push_subscriptions")
          .update({ last_error: `${status ?? ""} ${String(err)}`.trim().slice(0, 300) })
          .eq("id", sub.id);
      }
    }
  }

  return result;
}
