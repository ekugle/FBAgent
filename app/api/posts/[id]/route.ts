/**
 * GET    /api/posts/[id]   — get a single post
 * PATCH  /api/posts/[id]   — approve / reject / update a post
 * DELETE /api/posts/[id]   — delete a draft post
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, updatePostStatus } from "@/lib/supabase";
import { runAgent } from "@/lib/agent";
import { z } from "zod";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject", "update"]),
  approved_by: z.string().optional(),
  rejected_reason: z.string().optional(),
  content: z.string().optional(),
  scheduled_at: z.string().datetime().nullish(),
  post_now: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ post: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, approved_by, rejected_reason, content, scheduled_at, post_now } =
      parsed.data;

    const db = createServerClient();

    // Fetch the post
    const { data: post, error: fetchError } = await db
      .from("posts")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (action === "reject") {
      await updatePostStatus(id, "rejected", { rejected_reason });
      return NextResponse.json({ success: true, status: "rejected" });
    }

    if (action === "update") {
      const updates: Record<string, unknown> = {};
      if (content) updates.content = content;
      if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;

      const { error } = await db.from("posts").update(updates).eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "approve") {
      // post_now=true forces immediate publish regardless of scheduled_at
      const effectiveScheduledAt = post_now
        ? null
        : (scheduled_at ?? post.scheduled_at ?? null);

      const agentResult = await runAgent({
        trigger: "publish_approved",
        context: {
          post_id: id,
          content: content ?? post.content,
          image_urls: post.image_urls,
          scheduled_at: effectiveScheduledAt,
        },
      });

      // If the agent failed, surface the error — don't mark post as published
      if (!agentResult.success) {
        return NextResponse.json(
          { error: agentResult.error ?? "Failed to publish to Facebook", agent: agentResult },
          { status: 500 }
        );
      }

      const tenMinsFromNow = new Date(Date.now() + 10 * 60 * 1000);
      const willSchedule =
        !!effectiveScheduledAt &&
        new Date(effectiveScheduledAt) > tenMinsFromNow;

      await updatePostStatus(
        id,
        willSchedule ? "scheduled" : "published",
        { approved_by }
      );

      return NextResponse.json({
        success: true,
        agent: agentResult,
        post_now: post_now ?? false,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();

  // Only allow deleting drafts
  const { data: post } = await db
    .from("posts")
    .select("status")
    .eq("id", id)
    .single();

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (!["draft", "rejected"].includes(post.status)) {
    return NextResponse.json(
      { error: "Only draft or rejected posts can be deleted" },
      { status: 400 }
    );
  }

  const { error } = await db.from("posts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
