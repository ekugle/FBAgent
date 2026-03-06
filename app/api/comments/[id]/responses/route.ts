/**
 * GET   /api/comments/[id]/responses         — list responses for a comment
 * PATCH /api/comments/[id]/responses/[rid]   — approve/reject a response
 *
 * We handle both in this file using searchParams for the response ID on PATCH.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { replyToComment } from "@/lib/facebook";
import { z } from "zod";

const PatchSchema = z.object({
  response_id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  final_response: z.string().optional(), // human can edit the draft before approving
  approved_by: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();

  const { data, error } = await db
    .from("comment_responses")
    .select("*")
    .eq("comment_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ responses: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: commentId } = await params;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { response_id, action, final_response, approved_by } = parsed.data;
    const db = createServerClient();

    // Fetch comment and response
    const { data: comment } = await db
      .from("comments")
      .select("fb_comment_id")
      .eq("id", commentId)
      .single();

    const { data: response } = await db
      .from("comment_responses")
      .select("*")
      .eq("id", response_id)
      .single();

    if (!comment || !response) {
      return NextResponse.json(
        { error: "Comment or response not found" },
        { status: 404 }
      );
    }

    if (action === "reject") {
      await db
        .from("comment_responses")
        .update({ status: "rejected" })
        .eq("id", response_id);

      return NextResponse.json({ success: true, status: "rejected" });
    }

    if (action === "approve") {
      const textToPublish = final_response ?? response.draft_response;

      // Post the reply to Facebook
      const fbResult = await replyToComment(
        comment.fb_comment_id,
        textToPublish
      );

      // Update response record
      await db
        .from("comment_responses")
        .update({
          status: "published",
          final_response: textToPublish,
          fb_reply_id: fbResult.id,
          approved_by,
          published_at: new Date().toISOString(),
        })
        .eq("id", response_id);

      return NextResponse.json({
        success: true,
        status: "published",
        fb_reply_id: fbResult.id,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
