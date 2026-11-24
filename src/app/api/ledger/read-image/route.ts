import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/api-auth";

export const maxDuration = 120;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
/** The Messages API accepts images up to 5 MB each. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Pull one JSON value out of a model reply that may wrap it in prose or a fence. */
function parseJsonReply(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("No JSON in reply");
}

/**
 * Read a settlement sheet (or receipt, log, screenshot) with Claude and
 * return the structured JSON the ledger asked for in `prompt`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { code: "not_configured", error: "ANTHROPIC_API_KEY is not set" },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const prompt = form.get("prompt");
  const image = form.get("image");
  if (typeof prompt !== "string" || !prompt.trim() || !(image instanceof File)) {
    return NextResponse.json(
      { code: "invalid_request", error: "prompt and image are required" },
      { status: 400 }
    );
  }
  if (!IMAGE_TYPES.includes(image.type as ImageType) || image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { code: "image_rejected", error: "Use a JPEG, PNG, WebP or GIF under 5 MB" },
      { status: 400 }
    );
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  const client = new Anthropic();

  try {
    // Streamed so a slow handwriting read cannot hit an HTTP timeout.
    // The fallback lets another model answer if the first declines.
    const message = await client.beta.messages
      .stream({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.type as ImageType,
                  data,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      })
      .finalMessage();

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { code: "refused", error: "The image could not be read" },
        { status: 422 }
      );
    }

    let text = "";
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
    }

    try {
      return NextResponse.json({ result: parseJsonReply(text) });
    } catch {
      return NextResponse.json(
        { code: "invalid_json", error: "The reply was not valid JSON" },
        { status: 502 }
      );
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { code: "not_configured", error: "The Anthropic API key was rejected" },
        { status: 503 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { code: "rate_limited", error: "Rate limited, try again shortly" },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.BadRequestError) {
      return NextResponse.json(
        { code: "image_rejected", error: error.message },
        { status: 400 }
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message);
      return NextResponse.json(
        { code: "upstream_error", error: "The reading service failed" },
        { status: 502 }
      );
    }
    console.error("Read image failed:", error);
    return NextResponse.json(
      { code: "upstream_error", error: "The reading service failed" },
      { status: 502 }
    );
  }
}
