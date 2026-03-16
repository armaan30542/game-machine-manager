import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email } = await request.json();

  const adminClient = createAdminClient();

  const { error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Use the client-side resetPasswordForEmail to send the actual email
  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(
    email,
    {
      redirectTo: `${request.nextUrl.origin}/auth/callback?next=/reset-password`,
    }
  );

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
