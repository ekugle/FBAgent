/**
 * GET /api/cron/sync-published
 *
 * Cron job: Marks scheduled posts as published once their scheduled_at
 * time has passed. Publer handles the actual Facebook publishing —
 * this just keeps our DB status in sync so the Post Queue reflects reality.
 *
 * Runs every hour via vercel.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();

  // Find all scheduled posts whose scheduled time has passed (with a 2-min buffer
  // to avoid flipping posts that Publer hasn't had a chance to send yet)
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: stalePosts, error: fetchError } = await db
    .from("posts")
    .select("id, scheduled_at")
    .eq("status", "scheduled")
    .lt("scheduled_at", cutoff);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!stalePosts || stalePosts.length === 0) {
    return NextResponse.json({ success: true, updated: 0 });
  }

  const ids = stalePosts.map((p) => p.id);

  const { error: updateError } = await db
    .from("posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log(`sync-published: marked ${ids.length} post(s) as published`, ids);
  return NextResponse.json({ success: true, updated: ids.length, ids });
}
