/**
 * GET /api/cron/publish
 *
 * Cron job: Generate a new post draft via Claude agent.
 * Configure in vercel.json to run on your desired schedule
 * (e.g., twice a day at 9am and 3pm).
 *
 * Secured with CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function GET(req: NextRequest) {
  // Verify this is a legitimate cron call
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAgent({
      trigger: "cron_post",
      context: {
        // Optionally pass a topic hint based on the day/time
        topic_hint: getTopicForTime(),
      },
    });

    return NextResponse.json({
      success: result.success,
      summary: result.summary,
      tools_used: result.toolsUsed,
      iterations: result.iterations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    0: undefined as unknown as string, // Sunday — skip or general
  };
  return topics[day];
}
