/**
 * GET  /api/webhooks/facebook — Meta webhook verification challenge
 * POST /api/webhooks/facebook — Receive real-time page events (comments, etc.)
 *
 * Setup:
 * 1. In Meta Developer Console → Webhooks → Subscribe to: feed (comments)
 * 2. Set callback URL to: https://your-domain.com/api/webhooks/facebook
 * 3. Set verify token to match FACEBOOK_WEBHOOK_VERIFY_TOKEN env var
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookChallenge } from "@/lib/facebook";
import { upsertComment, createServerClient } from "@/lib/supabase";
import { runAgent } from "@/lib/agent";

// ─── Webhook verification (GET) ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = verifyWebhookChallenge(mode, token, challenge);

  if (result) {
    return new Response(result, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ─── Event processing (POST) ──────────────────────────────────────────────────

interface WebhookEntry {
  id: string;
  time: number;
  changes?: WebhookChange[];
}

interface WebhookChange {
  field: string;
  value: {
    item?: string;
    verb?: string;
    comment_id?: string;
    post_id?: string;
    from?: { name: string; id: string };
    message?: string;
    created_time?: number;
    parent_id?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      object: string;
      entry: WebhookEntry[];
    };

    // Only process page events
    if (body.object !== "page") {
      return NextResponse.json({ received: true });
    }

    // Process each entry
    for (const entry of body.entry) {
      if (!entry.changes) continue;

      for (const change of entry.changes) {
        await processChange(change);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Always return 200 to Meta to prevent retries on our bugs
    return NextResponse.json({ received: true });
  }
}

async function processChange(change: WebhookChange) {
  // We care about new comments on posts
  if (change.field !== "feed") return;

  const { item, verb, comment_id, post_id, from, message, created_time } =
    change.value;

  // Only handle new comments (not edits/deletes)
  if (item !== "comment" || verb !== "add") return;
  if (!comment_id || !post_id || !message) return;

  // Find our internal post ID (if we created the post)
  const db = createServerClient();
  const { data: internalPost } = await db
    .from("posts")
    .select("id")
    .eq("fb_post_id", post_id)
    .maybeSingle();

  // Save the comment
  const comment = await upsertComment({
    fb_comment_id: comment_id,
    fb_post_id: post_id,
    post_id: internalPost?.id ?? null,
    commenter_name: from?.name ?? null,
    commenter_id: from?.id ?? null,
    message,
    sentiment: null, // will be set by agent
    received_at: created_time
      ? new Date(created_time * 1000).toISOString()
      : new Date().toISOString(),
  });

  // Trigger Claude agent to analyze and draft a response
  // Fire-and-forget — don't await so webhook returns quickly
  runAgent({
    trigger: "webhook_comment",
    context: {
      comment_id: comment.id,
      fb_comment_id: comment_id,
      fb_post_id: post_id,
      commenter_name: from?.name ?? "Unknown",
      comment_text: message,
    },
  }).catch((err) => console.error("Agent error processing comment:", err));
}
