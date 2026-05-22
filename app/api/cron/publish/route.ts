/**
 * GET /api/cron/publish
 *
 * Cron job: runs daily at 9am (configured in vercel.json).
 * 1. Generates a new daily post draft via the Claude agent.
 * 2. Auto-triggers any campaigns whose next_auto_run is due.
 *
 * Secured with CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
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

  // ── 2. Auto-scheduled campaigns ───────────────────────────────────────────────
  const db = createServerClient();
  const now = new Date().toISOString();

  const { data: dueCampaigns } = await db
    .from("campaigns")
    .select("*")
    .eq("auto_enabled", true)
    .eq("is_active", true)
    .lte("next_auto_run", now);

  const campaignResults: Array<{ id: string; name: string; success: boolean; error?: string }> = [];

  for (const campaign of dueCampaigns ?? []) {
    try {
      const scheduledTimes = buildScheduledTimes(
        campaign.auto_quantity ?? 3,
        campaign.auto_frequency_days ?? 7
      );
      const runStartTime = new Date().toISOString();

      const result = await runAgent({
        trigger: "campaign_batch",
        context: {
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          campaign_description: campaign.description ?? "",
          content_template: campaign.content_template,
          image_urls: campaign.image_urls ?? [],
          category: campaign.category ?? "",
          page_key: campaign.page_key ?? "tx2pay",
          quantity: campaign.auto_quantity ?? 3,
          scheduled_times: scheduledTimes,
        },
      });

      // Tag posts with campaign_id
      if (result.success) {
        await db
          .from("posts")
          .update({ campaign_id: campaign.id })
          .eq("created_by", "agent")
          .is("campaign_id", null)
          .gte("created_at", runStartTime);
      }

      // Advance next_auto_run
      const nextRun = new Date(
        Date.now() + (campaign.auto_frequency_days ?? 7) * 24 * 60 * 60 * 1000
      ).toISOString();
      await db
        .from("campaigns")
        .update({ next_auto_run: nextRun })
        .eq("id", campaign.id);

      campaignResults.push({ id: campaign.id, name: campaign.name, success: result.success });
    } catch (err) {
      campaignResults.push({
        id: campaign.id,
        name: campaign.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  results.auto_campaigns = campaignResults;

  return NextResponse.json({ success: true, ...results });
}

/** Generate N ISO datetime strings starting from tomorrow 9am CT, spaced frequencyDays apart */
function buildScheduledTimes(quantity: number, frequencyDays: number): string[] {
  const times: string[] = [];
  // Start tomorrow at 9:00 AM CT
  const start = new Date();
  start.setDate(start.getDate() + 1);
  // Set to 14:00 UTC ≈ 9am CT (CDT, UTC-5) — close enough for auto runs
  start.setUTCHours(14, 0, 0, 0);

  for (let i = 0; i < quantity; i++) {
    const ms = start.getTime() + i * frequencyDays * 24 * 60 * 60 * 1000;
    times.push(new Date(ms).toISOString());
  }
  return times;
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
