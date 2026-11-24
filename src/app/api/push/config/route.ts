import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";
import { getVapidKeys } from "@/lib/push";

/** The public key a device needs to subscribe to notifications. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const keys = await getVapidKeys(createAdminClient());
    return NextResponse.json({ publicKey: keys.publicKey });
  } catch (err) {
    console.error("Push config failed:", err);
    return NextResponse.json(
      { error: "Notifications are not set up yet" },
      { status: 503 }
    );
  }
}
