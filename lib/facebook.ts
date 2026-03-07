/**
 * Meta Graph API client for TX2Pay Facebook Business Page management.
 *
 * Docs: https://developers.facebook.com/docs/graph-api
 */

import { createServerClient } from "@/lib/supabase";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

const PAGE_ID = process.env.FACEBOOK_PAGE_ID!;

/**
 * Returns the page access token.
 * Prefers the value stored in Supabase (set via OAuth flow), falls back to env var.
 */
async function getPageToken(): Promise<string> {
  try {
    const db = createServerClient();
    const { data } = await db
      .from("agent_memory")
      .select("value")
      .eq("key", "fb_page_token")
      .maybeSingle();
    if (data?.value) return data.value as string;
  } catch {
    // fall through to env var
  }
  return process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FBPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
}

export interface FBPostInsights {
  post_id: string;
  impressions: number;
  reach: number;
  engaged_users: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
}

export interface FBComment {
  id: string;
  message: string;
  from?: { name: string; id: string };
  created_time: string;
}

export interface FBPageInsights {
  page_impressions: number;
  page_reach: number;
  page_engaged_users: number;
  page_fans: number;
  page_post_engagements: number;
  period: { start: string; end: string };
}

export interface PublishResult {
  id: string; // format: PAGE_ID_POST_ID
}

export interface ScheduledPostResult {
  id: string;
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function graphFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<T> {
  const { params, ...init } = options;
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", await getPageToken());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  const json = (await res.json()) as T & { error?: { message: string; code: number } };

  if ("error" in json && json.error) {
    throw new Error(
      `Meta Graph API error ${json.error.code}: ${json.error.message}`
    );
  }

  return json;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

/**
 * Publish a post immediately to the Facebook Page feed.
 */
export async function publishPost(
  message: string,
  imageUrls?: string[]
): Promise<PublishResult> {
  if (imageUrls && imageUrls.length > 0) {
    // Multi-photo post: upload each photo as unpublished, then attach to post
    const photoIds = await Promise.all(
      imageUrls.map((url) => uploadPhoto(url, true))
    );

    return graphFetch<PublishResult>(`/${PAGE_ID}/feed`, {
      method: "POST",
      body: JSON.stringify({
        message,
        attached_media: photoIds.map((pid) => ({ media_fbid: pid })),
      }),
    });
  }

  return graphFetch<PublishResult>(`/${PAGE_ID}/feed`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/**
 * Schedule a post for future publishing via the Graph API.
 * @param scheduledUnixTs Unix timestamp (must be 10 min – 30 days in future)
 */
export async function schedulePost(
  message: string,
  scheduledUnixTs: number,
  imageUrls?: string[]
): Promise<ScheduledPostResult> {
  const body: Record<string, unknown> = {
    message,
    published: false,
    scheduled_publish_time: scheduledUnixTs,
  };

  if (imageUrls && imageUrls.length > 0) {
    const photoIds = await Promise.all(
      imageUrls.map((url) => uploadPhoto(url, true))
    );
    body.attached_media = photoIds.map((pid) => ({ media_fbid: pid }));
  }

  return graphFetch<ScheduledPostResult>(`/${PAGE_ID}/feed`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Delete a post from the Facebook Page.
 */
export async function deletePost(fbPostId: string): Promise<void> {
  await graphFetch(`/${fbPostId}`, { method: "DELETE" });
}

/**
 * Fetch recent posts from the page feed.
 */
export async function getPagePosts(limit = 20): Promise<FBPost[]> {
  const data = await graphFetch<{ data: FBPost[] }>(`/${PAGE_ID}/feed`, {
    params: {
      fields: "id,message,story,created_time,permalink_url",
      limit: String(limit),
    },
  });
  return data.data;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * Fetch comments for a specific post.
 */
export async function getPostComments(
  fbPostId: string,
  limit = 50
): Promise<FBComment[]> {
  const data = await graphFetch<{ data: FBComment[] }>(
    `/${fbPostId}/comments`,
    {
      params: {
        fields: "id,message,from,created_time",
        limit: String(limit),
      },
    }
  );
  return data.data;
}

/**
 * Reply to a comment as the Page.
 */
export async function replyToComment(
  commentId: string,
  message: string
): Promise<{ id: string }> {
  return graphFetch<{ id: string }>(`/${commentId}/comments`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/**
 * Hide a comment (sets it to not visible to others).
 */
export async function hideComment(commentId: string): Promise<void> {
  await graphFetch(`/${commentId}`, {
    method: "POST",
    body: JSON.stringify({ is_hidden: true }),
  });
}

// ─── Photos ───────────────────────────────────────────────────────────────────

/**
 * Upload a photo by URL. Returns the photo node ID.
 */
async function uploadPhoto(
  imageUrl: string,
  published: boolean
): Promise<string> {
  const result = await graphFetch<{ id: string }>(`/${PAGE_ID}/photos`, {
    method: "POST",
    body: JSON.stringify({ url: imageUrl, published }),
  });
  return result.id;
}

// ─── Page Insights ────────────────────────────────────────────────────────────

/**
 * Fetch page-level insights for a date range.
 * period: 'day' | 'week' | 'days_28' | 'month' | 'lifetime'
 */
export async function getPageInsights(
  since: Date,
  until: Date
): Promise<FBPageInsights> {
  const metrics = [
    "page_impressions",
    "page_reach",
    "page_engaged_users",
    "page_fans",
    "page_post_engagements",
  ];

  const data = await graphFetch<{
    data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
  }>(`/${PAGE_ID}/insights`, {
    params: {
      metric: metrics.join(","),
      period: "day",
      since: Math.floor(since.getTime() / 1000).toString(),
      until: Math.floor(until.getTime() / 1000).toString(),
    },
  });

  const latest: Record<string, number> = {};
  for (const metric of data.data) {
    const values = metric.values;
    if (values.length > 0) {
      const last = values[values.length - 1];
      latest[metric.name] =
        typeof last.value === "number" ? last.value : 0;
    }
  }

  return {
    page_impressions: latest["page_impressions"] ?? 0,
    page_reach: latest["page_reach"] ?? 0,
    page_engaged_users: latest["page_engaged_users"] ?? 0,
    page_fans: latest["page_fans"] ?? 0,
    page_post_engagements: latest["page_post_engagements"] ?? 0,
    period: {
      start: since.toISOString().split("T")[0],
      end: until.toISOString().split("T")[0],
    },
  };
}

/**
 * Fetch insights for a single post.
 */
export async function getPostInsights(
  fbPostId: string
): Promise<FBPostInsights> {
  const metrics = [
    "post_impressions",
    "post_reach",
    "post_engaged_users",
    "post_reactions_by_type_total",
    "post_clicks",
  ];

  const data = await graphFetch<{
    data: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }>;
  }>(`/${fbPostId}/insights`, {
    params: { metric: metrics.join(",") },
  });

  const m: Record<string, number> = {};
  for (const metric of data.data) {
    const val = metric.values?.[0]?.value;
    if (typeof val === "number") {
      m[metric.name] = val;
    } else if (typeof val === "object" && val !== null) {
      // reactions breakdown — sum all types
      m[metric.name] = Object.values(val).reduce((a, b) => a + b, 0);
    }
  }

  // Fetch basic counts from the post node itself
  const post = await graphFetch<{
    comments?: { summary: { total_count: number } };
    shares?: { count: number };
  }>(`/${fbPostId}`, {
    params: { fields: "comments.summary(true),shares" },
  });

  return {
    post_id: fbPostId,
    impressions: m["post_impressions"] ?? 0,
    reach: m["post_reach"] ?? 0,
    engaged_users: m["post_engaged_users"] ?? 0,
    reactions: m["post_reactions_by_type_total"] ?? 0,
    comments: post.comments?.summary?.total_count ?? 0,
    shares: post.shares?.count ?? 0,
    clicks: m["post_clicks"] ?? 0,
  };
}

// ─── Webhook verification ─────────────────────────────────────────────────────

/**
 * Verify a Meta webhook challenge request.
 */
export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null
): string | null {
  if (
    mode === "subscribe" &&
    token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN
  ) {
    return challenge;
  }
  return null;
}
