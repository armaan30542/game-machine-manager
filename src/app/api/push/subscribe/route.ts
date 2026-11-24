import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";

/** Register this device for notifications, for the signed-in person. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const authKey = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (
    !/^https:\/\//.test(endpoint) ||
    endpoint.length > 2000 ||
    !p256dh ||
    !authKey
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const service = createAdminClient();
  const { error } = await service.from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
      last_error: null,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("Push subscribe failed:", error.message);
    return NextResponse.json(
      { error: "Could not save this device" },
      { status: 500 }
    );
  }
  return NextResponse.json({ subscribed: true });
}

/** Remove this device. Only the person who registered it can remove it. */
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }

  const service = createAdminClient();
  await service
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", auth.user.id);
  return NextResponse.json({ subscribed: false });
}
