import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";
import { sendPush } from "@/lib/push";

/** Send a test notification to the signed-in person's own devices. */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const result = await sendPush(
      createAdminClient(),
      {
        title: "Game Machine Manager",
        body: "Notifications are working on this device.",
        url: "/weekly",
        tag: "test",
      },
      auth.user.id
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("Test push failed:", err);
    return NextResponse.json(
      { error: "The test could not be sent" },
      { status: 500 }
    );
  }
}
