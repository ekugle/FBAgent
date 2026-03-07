/**
 * GET /api/cron/analytics
 *
 * Cron job: Trigger Claude to generate a weekly performance summary.
 * Analytics data comes from what Publer/Supabase already has — no direct FB API.
 *
 * Recommended schedule: daily at midnight.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isSunday = new Date().getDay() === 0;
    let agentResult;
    if (isSunday) {
      agentResult = await runAgent({ trigger: "cron_analytics" });
    }

    return NextResponse.json({
      success: true,
      weekly_summary_triggered: isSunday,
      agent: agentResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
