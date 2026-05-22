/**
 * POST /api/campaigns/generate
 * Batch-generate post drafts from a campaign template and schedule them.
 *
 * Uses a single Claude API call (not the full agentic loop) so the route
 * completes in ~10-20 s and never hits Vercel's function timeout.
 *
 * Body:
 *   campaign_id    — UUID of the campaign to use
 *   quantity       — number of posts to generate (1-30)
 *   start_date     — ISO date string for the first post
 *   frequency_days — days between each post (default 2)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createPost } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GenerateSchema = z.object({
  campaign_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(30),
  start_date: z.string().datetime(),
  frequency_days: z.number().int().min(1).max(30).default(2),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { campaign_id, quantity, start_date, frequency_days } = parsed.data;

  const db = createServerClient();

  // Fetch the campaign
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

  // Format times for the prompt in CT
  const ctTimes = scheduledTimes
    .map(
      (t, i) =>
        `Post ${i + 1}: ${new Date(t).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
    )
    .join("\n");

  const pageLabel =
    campaign.page_key === "endorsements" ? "eEndorsements.com" : "TX2Pay";

  const systemPrompt = `You are an expert social media content creator. You write compelling, authentic Facebook posts for small businesses. Follow the campaign instructions exactly and produce varied, distinct content.`;

  const userMessage = `Generate exactly ${quantity} distinct Facebook post drafts for the "${campaign.name}" campaign.

Campaign Details:
- Facebook Page: ${pageLabel} (page_key: "${campaign.page_key ?? "tx2pay"}")
- Category: ${campaign.category || "general"}
- Description: ${campaign.description || "N/A"}

Content Template / Instructions:
---
${campaign.content_template}
---

Schedule (CT):
${ctTimes}

Requirements:
- Generate exactly ${quantity} posts
- Each post must be completely distinct (different angle, hook, scenario, or business type)
- Follow the template/instructions precisely
- Include relevant hashtags on every post

Return ONLY a valid JSON array with exactly ${quantity} objects and nothing else outside the array. Each object must have these two keys:
- "content": the complete post text including hashtags
- "agent_notes": one short sentence explaining your creative choice for this post

[{"content": "...", "agent_notes": "..."}, ...]`;

  let generated: Array<{ content: string; agent_notes: string }> = [];

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content.find((b) => b.type === "text")?.text ?? "[]";

    // Extract the JSON array, tolerating markdown code fences
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Claude did not return a JSON array");
    generated = JSON.parse(jsonMatch[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Content generation failed: ${message}` },
      { status: 500 }
    );
  }

  // Create each post draft in Supabase
  const createdIds: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < Math.min(generated.length, quantity); i++) {
    try {
      const post = await createPost({
        fb_post_id: null,
        content: generated[i].content,
        image_urls: campaign.image_urls ?? null,
        status: "pending_approval",
        scheduled_at: scheduledTimes[i] ?? null,
        published_at: null,
        created_by: "agent",
        approved_by: null,
        rejected_reason: null,
        agent_notes: `Campaign: ${campaign.name}. ${generated[i].agent_notes}`,
        metadata: {
          page_key: campaign.page_key ?? "tx2pay",
          post_type: "campaign",
          campaign_name: campaign.name,
        },
        campaign_id: null,
      });
      createdIds.push(post.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (createdIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Failed to save posts: ${errors[0] ?? "unknown error"}`,
      },
      { status: 500 }
    );
  }

  // Tag created posts with campaign_id (requires migration 005)
  try {
    await db
      .from("posts")
      .update({ campaign_id: campaign.id })
      .in("id", createdIds);
  } catch {
    // migration 005 not yet applied — tagging skipped, posts still created
  }

  // Advance next_auto_run if campaign auto-schedule is enabled (requires migration 005)
  if (campaign.auto_enabled && campaign.auto_frequency_days) {
    try {
      const nextRun = new Date(
        Date.now() + campaign.auto_frequency_days * 24 * 60 * 60 * 1000
      ).toISOString();
      await db
        .from("campaigns")
        .update({ next_auto_run: nextRun })
        .eq("id", campaign.id);
    } catch {
      // migration 005 not yet applied — next_auto_run not advanced
    }
  }

  const summary =
    `Generated ${createdIds.length} post draft${createdIds.length !== 1 ? "s" : ""} ` +
    `for "${campaign.name}" — ready for approval in the Post Queue.` +
    (errors.length > 0 ? ` (${errors.length} failed to save)` : "");

  return NextResponse.json({
    success: true,
    summary,
    postsCreated: createdIds.length,
    toolsUsed: ["direct_generation"],
    iterations: 1,
  });
}
