/**
 * GET /api/cron/analytics
 *
 * Cron job: Fetch page insights from Meta Graph API, store in Supabase,
 * and trigger Claude to generate a weekly performance summary.
 *
 * Recommended schedule: daily at midnight.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getPageInsights, getPagePosts, getPostInsights } from "@/lib/facebook";
import { runAgent } from "@/lib/agent";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    // ── Page-level analytics ──────────────────────────────────────────────────
    const insights = await getPageInsights(yesterday, today);

    const { error: analyticsError } = await db.from("page_analytics").upsert(
      {
        period_start: insights.period.start,
        period_end: insights.period.end,
        impressions: insights.page_impressions,
        reach: insights.page_reach,
        engaged_users: insights.page_engaged_users,
        page_fans: insights.page_fans,
        post_engagements: insights.page_post_engagements,
        reactions: 0, // rolled up from posts
        comments_count: 0,
        shares: 0,
        clicks: 0,
        raw_data: insights as unknown as Record<string, unknown>,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "period_start,period_end" }
    );

    if (analyticsError) {
      console.error("Analytics upsert error:", analyticsError);
    }

    // ── Per-post analytics for recently published posts ────────────────────────
    const recentFbPosts = await getPagePosts(5);
    const postAnalyticsResults = [];

    for (const fbPost of recentFbPosts) {
      try {
        const postInsights = await getPostInsights(fbPost.id);

        // Find our internal post
        const { data: internalPost } = await db
          .from("posts")
          .select("id")
          .eq("fb_post_id", fbPost.id)
          .maybeSingle();

        if (internalPost) {
          const reach = postInsights.reach;
          const engagements =
            postInsights.reactions +
            postInsights.comments +
            postInsights.shares +
            postInsights.clicks;
          const engagementRate = reach > 0 ? engagements / reach : 0;

          await db.from("post_analytics").insert({
            post_id: internalPost.id,
            fb_post_id: fbPost.id,
            impressions: postInsights.impressions,
            reach,
            reactions: postInsights.reactions,
            comments_count: postInsights.comments,
            shares: postInsights.shares,
            clicks: postInsights.clicks,
            engagement_rate: engagementRate,
            fetched_at: new Date().toISOString(),
          });

          postAnalyticsResults.push({ fb_post_id: fbPost.id, status: "ok" });
        }
      } catch (err) {
        postAnalyticsResults.push({
          fb_post_id: fbPost.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Trigger weekly summary on Sundays ─────────────────────────────────────
    const isSunday = new Date().getDay() === 0;
    let agentResult;
    if (isSunday) {
      agentResult = await runAgent({ trigger: "cron_analytics" });
    }

    return NextResponse.json({
      success: true,
      page_analytics: { period: insights.period },
      post_analytics: postAnalyticsResults,
      weekly_summary_triggered: isSunday,
      agent: agentResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
