import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PostStatus =
  | "draft"
  | "pending_approval"
  | "scheduled"
  | "published"
  | "rejected";

export type CommentResponseStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "published"
  | "rejected";

export interface Post {
  id: string;
  fb_post_id: string | null;
  content: string;
  image_urls: string[] | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string;
  approved_by: string | null;
  rejected_reason: string | null;
  agent_notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  fb_comment_id: string;
  fb_post_id: string;
  post_id: string | null;
  commenter_name: string | null;
  commenter_id: string | null;
  message: string;
  sentiment: string | null;
  received_at: string;
  created_at: string;
}

export interface CommentResponse {
  id: string;
  comment_id: string;
  draft_response: string;
  final_response: string | null;
  status: CommentResponseStatus;
  fb_reply_id: string | null;
  agent_reasoning: string | null;
  approved_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageAnalytics {
  id: string;
  period_start: string;
  period_end: string;
  impressions: number;
  reach: number;
  engaged_users: number;
  page_fans: number;
  post_engagements: number;
  reactions: number;
  comments_count: number;
  shares: number;
  clicks: number;
  raw_data: Record<string, unknown>;
  fetched_at: string;
}

export interface AgentMemory {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  trigger: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  tools_used: string[] | null;
  status: "running" | "completed" | "failed";
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ─── Client factory ───────────────────────────────────────────────────────────

/** Browser-safe anon client — use in Client Components */
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Server-side service-role client — use only in API routes / server components */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Convenience helpers (server-side) ───────────────────────────────────────

export async function getPendingPosts(): Promise<Post[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("posts")
    .select("*")
    .in("status", ["pending_approval", "scheduled"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDraftPosts(): Promise<Post[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getScheduledPosts(): Promise<Post[]> {
  const db = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createPost(
  post: Omit<Post, "id" | "created_at" | "updated_at">
): Promise<Post> {
  const db = createServerClient();
  const { data, error } = await db.from("posts").insert(post).select().single();
  if (error) throw error;
  return data;
}

export async function updatePostStatus(
  id: string,
  status: PostStatus,
  extras: Partial<Post> = {}
): Promise<void> {
  const db = createServerClient();
  const { error } = await db
    .from("posts")
    .update({ status, ...extras })
    .eq("id", id);
  if (error) throw error;
}

export async function upsertComment(
  comment: Omit<Comment, "id" | "created_at">
): Promise<Comment> {
  const db = createServerClient();
  const { data, error } = await db
    .from("comments")
    .upsert(comment, { onConflict: "fb_comment_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingCommentResponses(): Promise<
  (CommentResponse & { comment: Comment })[]
> {
  const db = createServerClient();
  const { data, error } = await db
    .from("comment_responses")
    .select("*, comment:comments(*)")
    .in("status", ["draft", "pending_approval"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAgentMemory(
  key: string
): Promise<AgentMemory | null> {
  const db = createServerClient();
  const { data } = await db
    .from("agent_memory")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  return data;
}

export async function setAgentMemory(
  key: string,
  value: unknown,
  description?: string
): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from("agent_memory").upsert(
    { key, value, description, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw error;
}

export async function logAgentRun(
  run: Omit<AgentRun, "id" | "created_at">
): Promise<string> {
  const db = createServerClient();
  const { data, error } = await db
    .from("agent_runs")
    .insert(run)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateAgentRun(
  id: string,
  update: Partial<AgentRun>
): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from("agent_runs").update(update).eq("id", id);
  if (error) throw error;
}

export async function getRecentAnalytics(
  limit = 7
): Promise<PageAnalytics[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("page_analytics")
    .select("*")
    .order("period_start", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Uploads an image buffer to Supabase Storage (post-images bucket) and
 * returns the public URL.  Uses the service-role client so it bypasses RLS.
 */
export async function uploadImageToStorage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const db = createServerClient();
  const { error } = await db.storage
    .from("post-images")
    .upload(filename, buffer, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = db.storage.from("post-images").getPublicUrl(filename);
  return data.publicUrl;
}

/**
 * Uploads a video buffer (MP4) to Supabase Storage (post-images bucket) and
 * returns the public URL.
 */
export async function uploadVideoToStorage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const db = createServerClient();
  const { error } = await db.storage
    .from("post-images")
    .upload(filename, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw error;
  const { data } = db.storage.from("post-images").getPublicUrl(filename);
  return data.publicUrl;
}
