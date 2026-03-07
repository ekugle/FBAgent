import Anthropic from "@anthropic-ai/sdk";
import {
  getAgentMemory,
  setAgentMemory,
  createPost,
  getPendingPosts,
  getRecentAnalytics,
  updatePostStatus,
} from "@/lib/supabase";
import {
  publishPost,
  schedulePost,
  getPagePosts,
  getPageInsights,
  getPostInsights,
  replyToComment,
  hideComment,
} from "@/lib/facebook";

// ─── Tool definitions (schema for Claude) ─────────────────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_memory",
    description:
      "Read a value from persistent agent memory. Use this to retrieve brand voice guidelines, recent topics, or business context before generating content.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description:
            "Memory key to read. Known keys: 'brand_voice', 'post_topics', 'business_context'",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "write_memory",
    description:
      "Persist a value in agent memory for future sessions. Use this to update the list of recently used topics after generating a post.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Memory key to write" },
        value: {
          type: "object",
          description: "Value to store (any JSON-serializable object)",
        },
        description: {
          type: "string",
          description: "Human-readable description of what this memory stores",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "create_draft_post",
    description:
      "Create a new post draft in the database for human approval. The post will NOT be published until a human approves it. Always use this instead of publish_post directly.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The post text content including hashtags",
        },
        image_urls: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of image URLs to attach",
        },
        scheduled_at: {
          type: "string",
          description:
            "ISO 8601 datetime string for scheduled publishing, or null to publish immediately upon approval",
        },
        agent_notes: {
          type: "string",
          description:
            "Your internal reasoning for this post: why this topic, why this angle, expected engagement",
        },
      },
      required: ["content", "agent_notes"],
    },
  },
  {
    name: "publish_approved_post",
    description:
      "Publish a post that has already been approved by a human reviewer. Only call this for posts with status 'pending_approval' that have been explicitly approved.",
    input_schema: {
      type: "object" as const,
      properties: {
        post_id: {
          type: "string",
          description: "The internal Supabase post UUID",
        },
        content: { type: "string", description: "The post content to publish" },
        image_urls: {
          type: "array",
          items: { type: "string" },
          description: "Optional image URLs",
        },
        scheduled_at: {
          type: "string",
          description: "ISO datetime for scheduled posts, null for immediate",
        },
      },
      required: ["post_id", "content"],
    },
  },
  {
    name: "get_page_analytics",
    description:
      "Fetch current Facebook Page analytics from the database (previously pulled from Meta). Use this to understand page performance before making content decisions.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Number of recent analytics snapshots to retrieve (default 7)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recent_posts",
    description:
      "Fetch recent posts from the Facebook Page to understand what content has been published recently and avoid repetition.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Number of posts to fetch (default 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "fetch_live_page_insights",
    description:
      "Fetch real-time page insights directly from the Meta Graph API for a date range. Use for fresh analytics data.",
    input_schema: {
      type: "object" as const,
      properties: {
        since_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        until_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
      },
      required: ["since_date", "until_date"],
    },
  },
  {
    name: "draft_comment_response",
    description:
      "Draft a response to a Facebook comment. The response will be saved for human approval before being posted. Also performs sentiment analysis on the comment.",
    input_schema: {
      type: "object" as const,
      properties: {
        comment_id: {
          type: "string",
          description: "Internal Supabase comment UUID",
        },
        fb_comment_id: {
          type: "string",
          description: "Facebook comment ID",
        },
        commenter_name: {
          type: "string",
          description: "Name of the person who commented",
        },
        comment_text: {
          type: "string",
          description: "The comment text to respond to",
        },
        draft_response: {
          type: "string",
          description: "Your drafted response to the comment",
        },
        sentiment: {
          type: "string",
          enum: ["positive", "neutral", "negative"],
          description: "Your sentiment analysis of the comment",
        },
        should_hide: {
          type: "boolean",
          description:
            "Set to true if comment should be hidden (spam, harassment, etc.) instead of responded to",
        },
        reasoning: {
          type: "string",
          description: "Your reasoning for this response approach",
        },
      },
      required: [
        "comment_id",
        "fb_comment_id",
        "comment_text",
        "draft_response",
        "sentiment",
        "reasoning",
      ],
    },
  },
  {
    name: "publish_comment_reply",
    description:
      "Post an approved reply to a Facebook comment. Only call this after human approval.",
    input_schema: {
      type: "object" as const,
      properties: {
        fb_comment_id: {
          type: "string",
          description: "Facebook comment ID to reply to",
        },
        response_text: {
          type: "string",
          description: "The approved response text",
        },
        should_hide_comment: {
          type: "boolean",
          description: "Whether to hide the original comment after replying",
        },
      },
      required: ["fb_comment_id", "response_text"],
    },
  },
  {
    name: "get_post_performance",
    description:
      "Fetch performance metrics for a specific published post from the Meta Graph API.",
    input_schema: {
      type: "object" as const,
      properties: {
        fb_post_id: {
          type: "string",
          description: "The Facebook post ID (format: PAGE_ID_POST_ID)",
        },
      },
      required: ["fb_post_id"],
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "read_memory": {
        const memory = await getAgentMemory(toolInput.key as string);
        return { success: true, data: memory?.value ?? null };
      }

      case "write_memory": {
        await setAgentMemory(
          toolInput.key as string,
          toolInput.value,
          toolInput.description as string | undefined
        );
        return { success: true, data: { written: toolInput.key } };
      }

      case "create_draft_post": {
        const post = await createPost({
          fb_post_id: null,
          content: toolInput.content as string,
          image_urls: (toolInput.image_urls as string[] | undefined) ?? null,
          status: "pending_approval",
          scheduled_at: (toolInput.scheduled_at as string | undefined) ?? null,
          published_at: null,
          created_by: "agent",
          approved_by: null,
          rejected_reason: null,
          agent_notes: toolInput.agent_notes as string,
          metadata: {},
        });
        return { success: true, data: { post_id: post.id, status: post.status } };
      }

      case "publish_approved_post": {
        const postId = toolInput.post_id as string;
        const content = toolInput.content as string;
        const imageUrls = toolInput.image_urls as string[] | undefined;
        const scheduledAt = toolInput.scheduled_at as string | undefined;

        // FB requires scheduled time to be at least 10 min in the future
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
        const shouldSchedule =
          !!scheduledAt && new Date(scheduledAt) > tenMinutesFromNow;

        if (shouldSchedule) {
          const scheduleTs = Math.floor(
            new Date(scheduledAt!).getTime() / 1000
          );
          const result = await schedulePost(content, scheduleTs, imageUrls);
          await updatePostStatus(postId, "scheduled", {
            fb_post_id: result.id,
            scheduled_at: scheduledAt,
          });
          return { success: true, data: { fb_post_id: result.id, status: "scheduled" } };
        } else {
          const result = await publishPost(content, imageUrls);
          await updatePostStatus(postId, "published", {
            fb_post_id: result.id,
            published_at: new Date().toISOString(),
          });
          return { success: true, data: { fb_post_id: result.id, status: "published" } };
        }
      }

      case "get_page_analytics": {
        const analytics = await getRecentAnalytics(
          (toolInput.limit as number | undefined) ?? 7
        );
        return { success: true, data: analytics };
      }

      case "get_recent_posts": {
        const posts = await getPagePosts(
          (toolInput.limit as number | undefined) ?? 10
        );
        return { success: true, data: posts };
      }

      case "fetch_live_page_insights": {
        const since = new Date(toolInput.since_date as string);
        const until = new Date(toolInput.until_date as string);
        const insights = await getPageInsights(since, until);
        return { success: true, data: insights };
      }

      case "draft_comment_response": {
        // Import dynamically to avoid circular deps
        const { createServerClient } = await import("@/lib/supabase");
        const db = createServerClient();

        // Update comment sentiment
        await db
          .from("comments")
          .update({ sentiment: toolInput.sentiment as string })
          .eq("id", toolInput.comment_id as string);

        // Create the response draft
        const { data: response, error } = await db
          .from("comment_responses")
          .insert({
            comment_id: toolInput.comment_id as string,
            draft_response: toolInput.draft_response as string,
            status: "pending_approval",
            agent_reasoning: toolInput.reasoning as string,
          })
          .select()
          .single();

        if (error) throw error;
        return {
          success: true,
          data: {
            response_id: response.id,
            sentiment: toolInput.sentiment,
            should_hide: toolInput.should_hide ?? false,
          },
        };
      }

      case "publish_comment_reply": {
        const fbCommentId = toolInput.fb_comment_id as string;
        const responseText = toolInput.response_text as string;
        const shouldHide = toolInput.should_hide_comment as boolean | undefined;

        const result = await replyToComment(fbCommentId, responseText);

        if (shouldHide) {
          await hideComment(fbCommentId);
        }

        return {
          success: true,
          data: { fb_reply_id: result.id, hidden: shouldHide ?? false },
        };
      }

      case "get_post_performance": {
        const insights = await getPostInsights(
          toolInput.fb_post_id as string
        );
        return { success: true, data: insights };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
