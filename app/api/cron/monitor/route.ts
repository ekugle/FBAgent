/**
 * GET /api/cron/monitor
 *
 * Cron job: Scan recent page posts for new comments and trigger
 * agent responses for any unanswered comments.
 *
 * This is a backup to the webhook — catches comments that might
 * have been missed if the webhook was down.
 *
 * Recommended schedule: every 30 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getPagePosts, getPostComments } from "@/lib/facebook";
import { runAgent } from "@/lib/agent";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const results = {
    posts_scanned: 0,
    new_comments: 0,
    responses_drafted: 0,
    errors: [] as string[],
  };

  try {
    // Get the last 10 published posts
    const recentPosts = await getPagePosts(10);
    results.posts_scanned = recentPosts.length;

    for (const fbPost of recentPosts) {
      try {
        const comments = await getPostComments(fbPost.id, 25);

        for (const fbComment of comments) {
          // Check if we've already processed this comment
          const { data: existing } = await db
            .from("comments")
            .select("id, comment_responses(id)")
            .eq("fb_comment_id", fbComment.id)
            .maybeSingle();

          if (existing) {
            // Already in DB — check if we have a response
            const existingWithResponses = existing as {
              id: string;
              comment_responses: { id: string }[];
            };
            if (
              !existingWithResponses.comment_responses ||
              existingWithResponses.comment_responses.length === 0
            ) {
              // Comment exists but no response drafted yet — trigger agent
              await runAgent({
                trigger: "webhook_comment",
                context: {
                  comment_id: existing.id,
                  fb_comment_id: fbComment.id,
                  fb_post_id: fbPost.id,
                  commenter_name: fbComment.from?.name ?? "Unknown",
                  comment_text: fbComment.message,
                },
              });
              results.responses_drafted++;
            }
            continue;
          }

          // New comment — save it and draft a response
          results.new_comments++;

          const { data: internalPost } = await db
            .from("posts")
            .select("id")
            .eq("fb_post_id", fbPost.id)
            .maybeSingle();

          const { data: savedComment } = await db
            .from("comments")
            .insert({
              fb_comment_id: fbComment.id,
              fb_post_id: fbPost.id,
              post_id: internalPost?.id ?? null,
              commenter_name: fbComment.from?.name ?? null,
              commenter_id: fbComment.from?.id ?? null,
              message: fbComment.message,
              sentiment: null,
              received_at: fbComment.created_time,
            })
            .select()
            .single();

          if (savedComment) {
            await runAgent({
              trigger: "webhook_comment",
              context: {
                comment_id: savedComment.id,
                fb_comment_id: fbComment.id,
                fb_post_id: fbPost.id,
                commenter_name: fbComment.from?.name ?? "Unknown",
                comment_text: fbComment.message,
              },
            });
            results.responses_drafted++;
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`Post ${fbPost.id}: ${message}`);
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
