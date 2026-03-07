import Anthropic from "@anthropic-ai/sdk";
import {
  getAgentMemory,
  setAgentMemory,
  createPost,
  getPendingPosts,
  getRecentAnalytics,
  updatePostStatus,
} from "@/lib/supabase";
import { publishPost, schedulePost, getPagePosts } from "@/lib/publer";

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
          const result = await schedulePost(content, scheduledAt!, imageUrls);
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

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
