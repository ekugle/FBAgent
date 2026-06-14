/**
 * GET /api/cron/publish
 *
 * Cron job: runs daily at 9am (configured in vercel.json).
 * Generates a new daily post draft via the Claude agent.
 *
 * NOTE: Auto-campaign scheduling is intentionally disabled.
 * Campaigns are launched manually from the Campaigns page only.
 *
 * Secured with CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Verify this is a legitimate cron call
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── 1. Daily cron post ────────────────────────────────────────────────────────
  try {
    const cronResult = await runAgent({
      trigger: "cron_post",
      context: {
        topic_hint: getTopicForTime(),
      },
    });
    results.cron_post = {
      success: cronResult.success,
      summary: cronResult.summary,
      tools_used: cronResult.toolsUsed,
    };
  } catch (err) {
    results.cron_post = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ success: true, ...results });
}

function getTopicForTime(): string | undefined {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const topics: Record<number, string> = {
    1: "payment processing tips", // Monday
    2: "invoicing best practices", // Tuesday
    3: "product feature spotlight", // Wednesday
    4: "small business finance advice", // Thursday
    5: "customer success story or testimonial", // Friday
    6: "weekend motivation for entrepreneurs", // Saturday
    0: undefined as unknown as string, // Sunday — general
  };
  return topics[day];
}
