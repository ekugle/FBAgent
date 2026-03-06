/**
 * GET /api/analytics — Fetch page analytics summary for the dashboard
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const db = createServerClient();

  const [analyticsResult, postsResult, commentsResult, agentRunsResult] =
    await Promise.all([
      db
        .from("page_analytics")
        .select("*")
        .order("period_start", { ascending: false })
        .limit(30),
      db.from("posts").select("status, created_at").order("created_at", {
        ascending: false,
      }),
      db.from("comments").select("sentiment, received_at").order("received_at", {
        ascending: false,
      }),
      db
        .from("agent_runs")
        .select("trigger, status, duration_ms, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const posts = postsResult.data ?? [];
  const comments = commentsResult.data ?? [];

  // Compute summary stats
  const stats = {
    posts: {
      total: posts.length,
      published: posts.filter((p) => p.status === "published").length,
      pending: posts.filter((p) => p.status === "pending_approval").length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      rejected: posts.filter((p) => p.status === "rejected").length,
    },
    comments: {
      total: comments.length,
      positive: comments.filter((c) => c.sentiment === "positive").length,
      neutral: comments.filter((c) => c.sentiment === "neutral").length,
      negative: comments.filter((c) => c.sentiment === "negative").length,
      unanalyzed: comments.filter((c) => !c.sentiment).length,
    },
    analytics: analyticsResult.data ?? [],
    recent_agent_runs: agentRunsResult.data ?? [],
  };

  return NextResponse.json(stats);
}
