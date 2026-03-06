/**
 * POST /api/agent
 * Manually trigger the Claude agent for any task.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAgent, AgentTrigger } from "@/lib/agent";
import { z } from "zod";

const RequestSchema = z.object({
  trigger: z.enum([
    "cron_post",
    "webhook_comment",
    "manual",
    "cron_analytics",
    "publish_approved",
  ]),
  context: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await runAgent({
      trigger: parsed.data.trigger as AgentTrigger,
      context: parsed.data.context,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
