/**
 * GET    /api/posts/[id]   — get a single post
 * PATCH  /api/posts/[id]   — approve / reject / update a post
 * DELETE /api/posts/[id]   — delete a draft post
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, updatePostStatus } from "@/lib/supabase";
import { publishPost, schedulePost } from "@/lib/facebook";
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

      const postContent = content ?? post.content;
      const imageUrls = post.image_urls ?? undefined;

      const tenMinsFromNow = new Date(Date.now() + 10 * 60 * 1000);
      const willSchedule =
        !!effectiveScheduledAt &&
        new Date(effectiveScheduledAt) > tenMinsFromNow;

      try {
        if (willSchedule) {
          const scheduleTs = Math.floor(new Date(effectiveScheduledAt!).getTime() / 1000);
          const result = await schedulePost(postContent, scheduleTs, imageUrls);
          await updatePostStatus(id, "scheduled", {
            approved_by,
            fb_post_id: result.id,
            scheduled_at: effectiveScheduledAt,
          });
          return NextResponse.json({ success: true, status: "scheduled", fb_post_id: result.id });
        } else {
          const result = await publishPost(postContent, imageUrls);
          await updatePostStatus(id, "published", {
            approved_by,
            fb_post_id: result.id,
            published_at: new Date().toISOString(),
          });
          return NextResponse.json({ success: true, status: "published", fb_post_id: result.id });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
      }
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
