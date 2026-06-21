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
import { createServerClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const maxDuration = 120;

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

  // Require a content template — without one Claude has nothing to work from
  if (!campaign.content_template?.trim()) {
    return NextResponse.json(
      { error: "This campaign has no content template. Edit the campaign and add a template before launching." },
      { status: 400 }
    );
  }

  // For Word Post campaigns, fetch active URLs from the rotation list
  const isWordPost = campaign.category === "word_post";
  let wordPostUrls: Array<{ url: string; label: string }> = [];
  if (isWordPost) {
    const { data: urlRows } = await db
      .from("word_post_urls")
      .select("url, label")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    wordPostUrls = urlRows ?? [];
    if (wordPostUrls.length === 0) {
      return NextResponse.json(
        { error: "No active URLs in the Word Post rotation. Add URLs in Settings first." },
        { status: 400 }
      );
    }
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

  // For word posts, assign one URL per post in round-robin order
  const urlAssignments: Array<{ url: string; label: string } | null> = Array.from(
    { length: quantity },
    (_, i) => (isWordPost && wordPostUrls.length > 0 ? wordPostUrls[i % wordPostUrls.length] : null)
  );

  const pageLabel =
    campaign.page_key === "endorsements" ? "eEndorsements.com" : "TX2Pay";

  const systemPrompt = `You are an expert social media content creator. You write compelling, authentic Facebook posts for small businesses. Follow the campaign instructions exactly and produce varied, distinct content.`;

  // Build per-post URL assignment list for word post campaigns
  const urlAssignmentBlock = isWordPost
    ? `\nURL Assignment (each post MUST link to its assigned URL — include the full URL in the post):\n` +
      urlAssignments
        .map((u, i) => `Post ${i + 1}: ${u!.label} → ${u!.url}`)
        .join("\n")
    : "";

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
${urlAssignmentBlock}
Requirements:
- Generate exactly ${quantity} posts
- Each post must be completely distinct (different angle, hook, or pain point)
- Follow the template/instructions precisely
- Include relevant hashtags on every post${isWordPost ? "\n- Each post MUST include its assigned URL exactly as shown above" : ""}
- Call the save_posts tool with all ${quantity} posts`;

  // Use tool_use to force structured output — the SDK handles all
  // serialization (special chars, apostrophes, emojis) so no JSON.parse needed.
  const postsToolSchema = {
    name: "save_posts",
    description: "Save the generated post drafts",
    input_schema: {
      type: "object" as const,
      properties: {
        posts: {
          type: "array",
          description: `Exactly ${quantity} post drafts`,
          items: {
            type: "object",
            properties: {
              content: {
                type: "string",
                minLength: 1,
                description: "Complete post text including hashtags (must not be empty)",
              },
              agent_notes: {
                type: "string",
                description: "One sentence explaining the creative choice",
              },
            },
            required: ["content", "agent_notes"],
          },
        },
      },
      required: ["posts"],
    },
  };

  let generated: Array<{ content: string; agent_notes: string }> = [];

  // Retry up to 3 attempts — Claude occasionally returns empty content on first try
  let lastGenError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        system: systemPrompt,
        tools: [postsToolSchema],
        tool_choice: { type: "tool", name: "save_posts" },
        messages: [{ role: "user", content: userMessage }],
      });

      const toolUse = response.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        lastGenError = "Claude did not call save_posts";
        console.error(`[campaigns/generate] attempt ${attempt}: no tool call — stop_reason=${response.stop_reason}`);
        continue;
      }
      const rawInput = toolUse.input;
      console.log(`[campaigns/generate] attempt ${attempt}: raw input type=${typeof rawInput}, keys=${Object.keys(rawInput as object ?? {}).join(",")}`);

      const rawPosts = (rawInput as { posts?: unknown }).posts;
      // Claude occasionally returns the posts array as a JSON string — parse it if so
      let resolvedPosts: unknown = rawPosts;
      if (typeof rawPosts === "string") {
        try { resolvedPosts = JSON.parse(rawPosts); } catch { /* leave as-is */ }
      }
      const posts: Array<{ content: string; agent_notes: string }> = Array.isArray(resolvedPosts) ? resolvedPosts : [];

      // Log what Claude returned so we can debug empty-content issues
      console.log(
        `[campaigns/generate] attempt ${attempt}: got ${posts.length} posts, ` +
        posts.map((p, i) => `post${i + 1}=${String(p.content ?? "").length}chars`).join(", ")
      );

      // Accept this attempt only if all posts have non-empty content
      const allFilled = posts.length >= quantity && posts.every((p) => String(p.content ?? "").trim().length > 0);
      if (allFilled) {
        generated = posts;
        break;
      }
      lastGenError = Array.isArray(resolvedPosts)
        ? `${posts.filter((p) => !String(p.content ?? "").trim()).length} post(s) returned empty content`
        : `posts field is not an array (got ${typeof resolvedPosts})`;
      console.error(`[campaigns/generate] attempt ${attempt}: ${lastGenError}`);
    } catch (err) {
      lastGenError = err instanceof Error ? err.message : String(err);
      console.error(`[campaigns/generate] attempt ${attempt} threw:`, lastGenError);
    }
  }

  if (generated.length === 0) {
    return NextResponse.json(
      { success: false, error: `Content generation failed after 3 attempts: ${lastGenError}` },
      { status: 500 }
    );
  }

  // Create each post draft in Supabase directly (no helper wrapper so
  // Supabase's PostgrestError.message is always accessible)
  const createdIds: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < Math.min(generated.length, quantity); i++) {
    // Guard: Claude occasionally returns null/empty content despite the schema
    const content = generated[i]?.content?.trim();
    if (!content) {
      console.error(`[campaigns/generate] post ${i + 1} has empty content — skipping. Campaign template: "${campaign.content_template?.slice(0, 100)}"`);
      errors.push(`Post ${i + 1}: Claude returned empty content — check that the campaign template has enough detail`);
      continue;
    }

    const insertPayload: Record<string, unknown> = {
      content,
      status: "pending_approval",
      scheduled_at: scheduledTimes[i] ?? null,
      created_by: "agent",
      agent_notes: `Campaign: ${campaign.name}. ${generated[i].agent_notes ?? ""}`.trim(),
      metadata: {
        page_key: campaign.page_key ?? "tx2pay",
        post_type: isWordPost ? "word" : "campaign",
        campaign_name: campaign.name,
        ...(isWordPost && urlAssignments[i]
          ? { url: urlAssignments[i]!.url, url_label: urlAssignments[i]!.label }
          : {}),
      },
    };
    if (campaign.image_urls && campaign.image_urls.length > 0) {
      insertPayload.image_urls = campaign.image_urls;
    }

    const { data: postData, error: insertError } = await db
      .from("posts")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      const msg = insertError.message ?? JSON.stringify(insertError);
      console.error(`[campaigns/generate] insert error (post ${i + 1}):`, msg);
      errors.push(msg);
    } else if (postData) {
      createdIds.push(postData.id);
    }
  }

  if (createdIds.length === 0) {
    const detail = errors[0] ?? "unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to save posts: ${detail}` },
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
