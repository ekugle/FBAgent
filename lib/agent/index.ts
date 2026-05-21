/**
 * TX2Pay Facebook Business Agent — Main agentic loop using Claude with tool use.
 *
 * Uses the Anthropic SDK with an iterative tool-calling loop until Claude
 * decides it has completed the task (no more tool calls).
 */

import Anthropic from "@anthropic-ai/sdk";
import { AGENT_TOOLS, executeTool } from "./tools";
import {
  BASE_SYSTEM_PROMPT,
  POST_GENERATION_PROMPT,
  COMMENT_RESPONSE_PROMPT,
  ANALYTICS_SUMMARY_PROMPT,
  CAMPAIGN_BATCH_PROMPT,
} from "./prompts";
import { logAgentRun, updateAgentRun } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 10; // safety limit on tool call rounds

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentTrigger =
  | "cron_post"
  | "webhook_comment"
  | "manual"
  | "cron_analytics"
  | "publish_approved"
  | "campaign_batch";

export interface AgentInput {
  trigger: AgentTrigger;
  /** Additional context for the specific task */
  context?: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  summary: string;
  toolsUsed: string[];
  iterations: number;
  error?: string;
}

// ─── Agent runner ─────────────────────────────────────────────────────────────

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const toolsUsed: string[] = [];
  let runId: string | null = null;

  try {
    runId = await logAgentRun({
      trigger: input.trigger,
      input: input.context ?? {},
      output: {},
      tools_used: [],
      status: "running",
      error_message: null,
      duration_ms: null,
    });

    const userMessage = buildUserMessage(input);
    const systemPrompt = buildSystemPrompt(input.trigger);

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    let iterations = 0;
    let finalText = "";

    // ── Agentic loop ──────────────────────────────────────────────────────────
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages,
      });

      // Collect any text from this response
      for (const block of response.content) {
        if (block.type === "text") {
          finalText = block.text;
        }
      }

      // If Claude is done (no tool calls), break
      if (response.stop_reason === "end_turn") {
        break;
      }

      // Process tool calls
      if (response.stop_reason === "tool_use") {
        // Append assistant message with tool uses
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const toolName = block.name;
          const toolInput = block.input as Record<string, unknown>;

          if (!toolsUsed.includes(toolName)) {
            toolsUsed.push(toolName);
          }

          const result = await executeTool(toolName, toolInput);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        // Feed tool results back to Claude
        messages.push({ role: "user", content: toolResults });
      } else {
        // Unexpected stop reason — bail out
        break;
      }
    }

    const duration = Date.now() - startTime;
    const output: AgentOutput = {
      success: true,
      summary: finalText || "Agent completed task successfully.",
      toolsUsed,
      iterations,
    };

    if (runId) {
      await updateAgentRun(runId, {
        output: { summary: output.summary },
        tools_used: toolsUsed,
        status: "completed",
        duration_ms: duration,
      });
    }

    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - startTime;

    if (runId) {
      await updateAgentRun(runId, {
        status: "failed",
        error_message: message,
        duration_ms: duration,
      });
    }

    return {
      success: false,
      summary: `Agent failed: ${message}`,
      toolsUsed,
      iterations: 0,
      error: message,
    };
  }
}

// ─── Message builders ─────────────────────────────────────────────────────────

function buildSystemPrompt(trigger: AgentTrigger): string {
  switch (trigger) {
    case "cron_post":
      return `${BASE_SYSTEM_PROMPT}\n\n${POST_GENERATION_PROMPT}`;
    case "webhook_comment":
      return `${BASE_SYSTEM_PROMPT}\n\n${COMMENT_RESPONSE_PROMPT}`;
    case "cron_analytics":
      return `${BASE_SYSTEM_PROMPT}\n\n${ANALYTICS_SUMMARY_PROMPT}`;
    case "publish_approved":
      return `${BASE_SYSTEM_PROMPT}\n\nYou are publishing an approved post or comment reply to Facebook. Use the publish tools to complete this action.`;
    case "campaign_batch":
      return `${BASE_SYSTEM_PROMPT}\n\n${CAMPAIGN_BATCH_PROMPT}`;
    case "manual":
    default:
      return BASE_SYSTEM_PROMPT;
  }
}

function buildUserMessage(input: AgentInput): string {
  const ctx = input.context ?? {};

  switch (input.trigger) {
    case "cron_post":
      return `
It's time to create a new Facebook post for TX2Pay.

Steps to follow:
1. Use read_memory to get 'brand_voice' and 'post_topics' so you know the brand guidelines and what topics have been used recently
2. Use get_recent_posts to see what has been published to avoid repetition
3. Use get_page_analytics to understand what content performs best
4. Generate a compelling, on-brand post for the TX2Pay Facebook page
5. Use create_draft_post to save it for human approval (include your reasoning in agent_notes)
6. Use write_memory to update 'post_topics' with the topic you just covered
7. Summarize what you created and why

${ctx.topic_hint ? `Suggested topic: ${ctx.topic_hint}` : "Choose the most appropriate topic based on recent performance and rotation schedule."}
`.trim();

    case "webhook_comment":
      return `
A new comment has been received on the TX2Pay Facebook page and needs a response.

Comment details:
- Comment ID (internal): ${ctx.comment_id}
- Facebook Comment ID: ${ctx.fb_comment_id}
- Commenter: ${ctx.commenter_name ?? "Unknown"}
- Post: ${ctx.fb_post_id}
- Comment: "${ctx.comment_text}"

Steps to follow:
1. Use read_memory to get 'brand_voice' for tone guidance
2. Analyze the comment's sentiment, intent, and urgency
3. Use draft_comment_response to save your response for human approval
4. Summarize your analysis and approach
`.trim();

    case "cron_analytics":
      return `
Generate a weekly analytics summary for the TX2Pay Facebook page.

Steps to follow:
1. Use get_page_analytics to get the last 7 days of analytics data from the database
2. Use fetch_live_page_insights with since_date="${getDateDaysAgo(7)}" and until_date="${getTodayDate()}" for current data
3. Use get_recent_posts to see what content was published this period
4. Analyze the data comprehensively
5. Use write_memory to store your top insights under key 'last_analytics_summary'
6. Provide a detailed summary with actionable recommendations
`.trim();

    case "publish_approved":
      return `
Publish the following approved content to Facebook:

Post ID: ${ctx.post_id}
Content: ${ctx.content}
${ctx.image_urls ? `Images: ${JSON.stringify(ctx.image_urls)}` : ""}
${ctx.scheduled_at ? `Schedule for: ${ctx.scheduled_at}` : "Publish immediately."}

Use publish_approved_post to complete this action.
`.trim();

    case "campaign_batch": {
      const times = (ctx.scheduled_times as string[])
        .map((t, i) => `  Post ${i + 1}: ${t}`)
        .join("\n");
      return `
Generate ${ctx.quantity} Facebook post drafts for the "${ctx.campaign_name}" campaign.

Campaign Details:
- Name: ${ctx.campaign_name}
- Category: ${ctx.category || "general"}
- Description: ${ctx.campaign_description || "N/A"}

Content Template (use this as the base for all posts, vary the hook/wording slightly):
---
${ctx.content_template}
---

${(ctx.image_urls as string[]).length > 0 ? `Images to attach: ${JSON.stringify(ctx.image_urls)}` : "No images."}

Schedule each post at these exact times:
${times}

Target Facebook page: ${ctx.page_key === "endorsements" ? "eEndorsements.com" : "TX2Pay"} (page_key: "${ctx.page_key ?? "tx2pay"}")

Instructions:
1. Call create_draft_post ${ctx.quantity} times — once per scheduled time above
2. Each post must include the scheduled_at from the list above AND page_key: "${ctx.page_key ?? "tx2pay"}"
3. Vary the opening hook across posts so they feel fresh, but keep the core message consistent
4. In agent_notes for each post, include: "Campaign: ${ctx.campaign_name}"
5. After all drafts are created, summarize what was generated
`.trim();
    }

    case "manual":
    default:
      return ctx.message as string ?? "Please complete the requested task.";
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}
