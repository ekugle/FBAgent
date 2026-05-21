/**
 * Publer API client — handles publishing to multiple Facebook pages.
 *
 * Publer manages Facebook OAuth tokens so we never deal with FB App credentials.
 * API key: Publer → Settings → Access & Login → API Keys (Business plan).
 *
 * Pages are identified by a pageKey ('tx2pay' | 'endorsements') which maps to
 * the corresponding PUBLER_*_ACCOUNT_ID env var via lib/pages.ts.
 *
 * Docs: https://publer.com/docs
 */

import { getAccountId } from "./pages";

const PUBLER_BASE = "https://app.publer.com/api/v1";

function publerHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer-API ${process.env.PUBLER_API_KEY!}`,
    "Publer-Workspace-Id": process.env.PUBLER_WORKSPACE_ID!,
    "Content-Type": "application/json",
  };
}

async function publerFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${PUBLER_BASE}${path}`, {
    ...options,
    headers: {
      ...publerHeaders(),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Publer API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublerJobResponse {
  job_id: string;
}

interface PublerJobStatus {
  status: string; // 'processing' | 'done' | 'failed'
  posts?: Array<{
    id: string;
    external_id?: string; // Native Facebook post ID
    external_url?: string;
  }>;
  error?: string;
}

export interface PublerPost {
  id: string;
  text?: string;
  created_at?: string;
  scheduled_at?: string;
  external_id?: string; // Native Facebook post ID
  external_url?: string;
  status?: string;
}

export interface PublishResult {
  id: string; // Native FB post ID if available, otherwise Publer post ID
}

export interface ScheduledPostResult {
  id: string;
}

// ─── Job poller ───────────────────────────────────────────────────────────────

/**
 * Poll a Publer job until it completes, returning the first published post's
 * native Facebook post ID (or the Publer job ID as fallback).
 */
async function waitForJob(jobId: string, maxAttempts = 5): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await publerFetch<PublerJobStatus>(`/job_status/${jobId}`);
    if (job.status === "done") {
      const nativeId = job.posts?.[0]?.external_id;
      return nativeId ?? jobId;
    }
    if (job.status === "failed") {
      throw new Error(`Publer job failed: ${job.error ?? "unknown reason"}`);
    }
  }
  // Return job ID as fallback — post is still queued in Publer
  return jobId;
}

// ─── Publishing ───────────────────────────────────────────────────────────────

/**
 * Publish a post immediately to the Facebook Page via Publer.
 * Polls for the native Facebook post ID so the rest of the system
 * (comment monitoring, analytics) can match on it.
 */
export async function publishPost(
  message: string,
  imageUrls?: string[],
  pageKey?: string
): Promise<PublishResult> {
  const accountId = getAccountId(pageKey);
  const post: Record<string, unknown> = {
    networks: {
      facebook: {
        type: "status",
        text: message,
      },
    },
    accounts: [{ id: accountId }],
  };

  // Media lives at the post level, not inside networks.facebook
  if (imageUrls && imageUrls.length > 0) {
    post.media = imageUrls.map((url) => ({ url, type: "IMAGE" }));
  }

  const response = await publerFetch<PublerJobResponse>("/posts/schedule/publish", {
    method: "POST",
    body: JSON.stringify({
      bulk: {
        state: "scheduled",
        posts: [post],
      },
    }),
  });

  const id = await waitForJob(response.job_id);
  return { id };
}

/**
 * Schedule a post for future publishing via Publer.
 * Returns the Publer job ID; the native Facebook post ID is only available
 * after Publer actually publishes at the scheduled time.
 */
export async function schedulePost(
  message: string,
  scheduledAt: string, // ISO 8601 datetime string
  imageUrls?: string[],
  pageKey?: string
): Promise<ScheduledPostResult> {
  const accountId = getAccountId(pageKey);
  const post: Record<string, unknown> = {
    networks: {
      facebook: {
        type: "status",
        text: message,
      },
    },
    accounts: [
      {
        id: accountId,
        scheduled_at: scheduledAt,
      },
    ],
  };

  // Media lives at the post level, not inside networks.facebook
  if (imageUrls && imageUrls.length > 0) {
    post.media = imageUrls.map((url) => ({ url, type: "IMAGE" }));
  }

  const response = await publerFetch<PublerJobResponse>("/posts/schedule", {
    method: "POST",
    body: JSON.stringify({
      bulk: {
        state: "scheduled",
        posts: [post],
      },
    }),
  });

  return { id: response.job_id };
}

// ─── Post retrieval ───────────────────────────────────────────────────────────

interface PublerPostsResponse {
  posts: PublerPost[];
  total?: number;
}

/**
 * Fetch recent posts published via Publer for this Facebook account.
 * Returns in the same shape as the old getPagePosts() so callers don't change.
 */
export async function getPagePosts(
  limit = 20
): Promise<
  Array<{
    id: string;
    message?: string;
    created_time: string;
    permalink_url?: string;
  }>
> {
  const data = await publerFetch<PublerPostsResponse>(
    `/posts?account_id=${process.env.PUBLER_FACEBOOK_ACCOUNT_ID!}&limit=${limit}&status=published`
  );

  return (data.posts ?? []).map((p) => ({
    // Prefer the native Facebook post ID for downstream comment matching
    id: p.external_id ?? p.id,
    message: p.text,
    created_time: p.created_at ?? new Date().toISOString(),
    permalink_url: p.external_url,
  }));
}
