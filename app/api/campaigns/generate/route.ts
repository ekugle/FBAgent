/**
 * POST /api/campaigns/generate
 * Batch-generate post drafts from a campaign template and schedule them.
 *
 * Body:
 *   campaign_id   — UUID of the campaign to use
 *   quantity      — number of posts to generate (1-30)
 *   start_date    — ISO date string for the first post (e.g. "2026-03-10T09:00:00")
 *   frequency_days — days between each post (default 2)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runAgent } from "@/lib/agent";
import { z } from "zod";

const GenerateSchema = z.object({
  campaign_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(30),
  start_date: z.string().datetime(),
  frequency_days: z.number().int().min(1).max(30).default(2),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = GenerateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { campaign_id, quantity, start_date, frequency_days } = parsed.data;

    // Fetch the campaign
    const db = createServerClient();
    const { data: campaign, error: campaignError } = await db
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Build the list of scheduled datetimes
    const scheduledTimes: string[] = [];
    const startMs = new Date(start_date).getTime();
    for (let i = 0; i < quantity; i++) {
      const ms = startMs + i * frequency_days * 24 * 60 * 60 * 1000;
      scheduledTimes.push(new Date(ms).toISOString());
    }

    // Run the agent with campaign_batch trigger
    const result = await runAgent({
      trigger: "campaign_batch",
      context: {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_description: campaign.description ?? "",
        content_template: campaign.content_template,
        image_urls: campaign.image_urls ?? [],
        category: campaign.category ?? "",
        quantity,
        scheduled_times: scheduledTimes,
      },
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
