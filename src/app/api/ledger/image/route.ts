import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";

export const maxDuration = 30;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Store a ledger image in the private 'ledger' bucket and return its id. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }
  if (!IMAGE_TYPES.includes(image.type) || image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Use a JPEG, PNG, WebP or GIF under 20 MB" },
      { status: 400 }
    );
  }

  const id = randomUUID();
  const service = createAdminClient();
  const { error } = await service.storage
    .from("ledger")
    .upload(id, Buffer.from(await image.arrayBuffer()), {
      contentType: image.type,
      upsert: false,
    });
  if (error) {
    console.error("Ledger image upload failed:", error.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  return NextResponse.json({ id });
}
