"use client";

import { useState, useEffect, useRef } from "react";
import { Post } from "@/lib/supabase";
import {
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Send,
  Zap,
  Trash2,
  Bot,
  ImageIcon,
  Pencil,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { clsx } from "clsx";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: Clock },
  pending_approval: {
    label: "Pending Approval",
    color: "bg-amber-100 text-amber-700",
    icon: Clock,
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-blue-100 text-blue-700",
    icon: Clock,
  },
  published: {
    label: "Published",
    color: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 text-red-700",
    icon: XCircle,
  },
};

interface PostCardProps {
  post: Post;
}

export default function PostCard({ post }: PostCardProps) {
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  const [editedScheduledAt, setEditedScheduledAt] = useState(post.scheduled_at ?? "");
  const [currentScheduledAt, setCurrentScheduledAt] = useState(post.scheduled_at ?? "");
  const [currentStatus, setCurrentStatus] = useState(post.status);
  const [error, setError] = useState<string | null>(null);
  const isReel = (post.metadata as Record<string, unknown>)?.post_type === "reel";

  // Image state (non-reel posts)
  const [imageUrl, setImageUrl] = useState<string | null>(
    isReel ? null : (post.image_urls?.[0] ?? null)
  );
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Video state (reel posts) — persists pipeline phase across page reloads via DB
  const initialVideoPhase = (() => {
    const meta = post.metadata as Record<string, unknown>;
    const phase = meta?.video_gen_phase as string | undefined;
    // Treat as complete if video is already saved to storage, regardless of DB phase flag
    if (phase === "complete" || (isReel && post.image_urls?.[0])) return "complete";
    return phase ?? "idle";
  })();
  const [videoPhase, setVideoPhase] = useState<string>(initialVideoPhase);
  const [videoUrl, setVideoUrl] = useState<string | null>(
    isReel ? (post.image_urls?.[0] ?? null) : null
  );
  const [videoError, setVideoError] = useState<string | null>(null);
  const [retrieveMode, setRetrieveMode] = useState(false);
  const [retrieveInput, setRetrieveInput] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Convert UTC ISO string → "YYYY-MM-DDTHH:mm" in browser local time for datetime-local input */
  function toDatetimeLocal(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  }

  const statusConfig = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  const canApprove = currentStatus === "pending_approval";
  const canReject = currentStatus === "pending_approval";
  const canPostNow = ["pending_approval", "scheduled", "draft"].includes(currentStatus);
  const canEdit = currentStatus !== "published";

  async function handleApprove(postNow = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          content: editedContent,
          approved_by: "admin",
          post_now: postNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      // Optimistic status: post_now → always published; otherwise check scheduled_at
      const tenMinsFromNow = new Date(Date.now() + 10 * 60 * 1000);
      const willSchedule =
        !postNow &&
        !!post.scheduled_at &&
        new Date(post.scheduled_at) > tenMinsFromNow;
      setCurrentStatus(willSchedule ? "scheduled" : "published");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error approving post");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    const reason = prompt("Reason for rejection (optional):");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejected_reason: reason ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      setCurrentStatus("rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error rejecting post");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { action: "update", content: editedContent };
      if (editedScheduledAt) {
        body.scheduled_at = new Date(editedScheduledAt).toISOString();
      }
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setEditMode(false);
      if (editedScheduledAt) setCurrentScheduledAt(editedScheduledAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving post");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post draft?")) return;
    setLoading(true);
    try {
      await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateImage() {
    setGeneratingImage(true);
    setImageError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/generate-image`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Image generation failed");
      setImageUrl(data.image_url);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Error generating image");
    } finally {
      setGeneratingImage(false);
    }
  }

  // ── Video polling helpers ──────────────────────────────────────────────────

  function startPolling(postId: string) {
    console.log("[Video] Starting polling for post", postId);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/generate-video`);
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { console.warn("[Video] Poll returned non-JSON", res.status); return; }
        console.log("[Video] Poll response:", data.status, data);
        if (!res.ok || data.error) {
          setVideoError((data.error as string) ?? `Generation failed (${res.status})`);
          setVideoPhase("idle");
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          return;
        }
        setVideoPhase((data.status as string) ?? "idle");
        if (data.status === "complete") {
          setVideoUrl((data.video_url as string) || null);
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      } catch (err) {
        console.warn("[Video] Poll network error:", err);
      }
    }, 5000);
  }

  // Resume polling if a generation was in-flight when the page loaded
  useEffect(() => {
    if (isReel && (initialVideoPhase === "generating_image" || initialVideoPhase === "image" ||
                   initialVideoPhase === "generating_video" || initialVideoPhase === "video")) {
      startPolling(post.id);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerateVideo() {
    setVideoError(null);
    setVideoPhase("generating_image");
    console.log("[Video] Starting generation for post", post.id);
    try {
      const res = await fetch(`/api/posts/${post.id}/generate-video`, { method: "POST" });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { data = { error: `Server returned ${res.status} (non-JSON)` }; }
      console.log("[Video] POST response:", res.status, data);
      if (!res.ok || data.error) {
        setVideoPhase("idle");
        setVideoError((data.error as string) ?? `Failed to start (HTTP ${res.status})`);
        return;
      }
      if (data.status === "complete") {
        setVideoUrl((data.video_url as string) || null);
        setVideoPhase("complete");
        return;
      }
      setVideoPhase((data.status as string) ?? "generating_image");
      startPolling(post.id);
    } catch (err) {
      setVideoPhase("idle");
      setVideoError(err instanceof Error ? err.message : "Error starting video generation");
    }
  }

  async function handleRegenerateVideo() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setVideoError(null);
    setVideoPhase("generating_image");
    try {
      const res = await fetch(`/api/posts/${post.id}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restart: true }),
      });
      const data = await res.json();
      if (!res.ok) { setVideoPhase("idle"); setVideoError(data.error ?? "Failed to start"); return; }
      setVideoPhase(data.status ?? "generating_image");
      startPolling(post.id);
    } catch (err) {
      setVideoPhase("idle");
      setVideoError(err instanceof Error ? err.message : "Error starting video generation");
    }
  }

  async function handleRetrieve() {
    if (!retrieveInput.trim()) return;
    setRetrieving(true);
    setVideoError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/retrieve-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leonardo_url: retrieveInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Video] Retrieve response:", data);
        setVideoError(data.error ?? `Retrieve failed (${res.status})`);
        return;
      }
      setVideoUrl(data.video_url);
      setVideoPhase("complete");
      setRetrieveMode(false);
      setRetrieveInput("");
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Retrieve error");
    } finally {
      setRetrieving(false);
    }
  }

  return (
    <div
      className={clsx(
        "card p-6 transition-all",
        currentStatus === "pending_approval" && "border-amber-300"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${statusConfig.color}`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </span>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </span>
          {post.created_by === "agent" && (
            <span className="badge bg-purple-100 text-purple-700">
              <Bot className="w-3 h-3 mr-1" />
              AI Generated
            </span>
          )}
          {(post.metadata as Record<string, unknown>)?.post_type === "hustle" && (
            <span className="badge bg-orange-100 text-orange-700">
              💪 Hustle
            </span>
          )}
          {(post.metadata as Record<string, unknown>)?.post_type === "word" && (
            <span className="badge bg-sky-100 text-sky-700">
              🔗 Word Post
            </span>
          )}
          {(post.metadata as Record<string, unknown>)?.post_type === "image" && (
            <span className="badge bg-emerald-100 text-emerald-700">
              🎨 Image Post
            </span>
          )}
          {(post.metadata as Record<string, unknown>)?.post_type === "reel" && (
            <span className="badge bg-pink-100 text-pink-700">
              🎬 Reel Video
            </span>
          )}
          {currentScheduledAt && (
            <span className="text-xs text-blue-600">
              Scheduled: {new Date(currentScheduledAt).toLocaleString()}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="btn-secondary py-1.5 text-xs"
              title="Edit post content"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}
          {post.fb_post_id && (
            <a
              href={`https://facebook.com/${post.fb_post_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary py-1.5 text-xs"
            >
              <ExternalLink className="w-3 h-3" />
              View on FB
            </a>
          )}
        </div>
      </div>

      {/* Content */}
      {editMode ? (
        <div>
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={10}
            className="w-full text-sm text-gray-800 border border-blue-400 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            autoFocus
          />
          {/* Scheduled date/time */}
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="block text-xs font-medium text-blue-700 mb-1">
              Schedule Date &amp; Time (your local time)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="datetime-local"
                value={editedScheduledAt ? toDatetimeLocal(editedScheduledAt) : ""}
                onChange={(e) =>
                  setEditedScheduledAt(
                    e.target.value ? new Date(e.target.value).toISOString() : ""
                  )
                }
                className="text-sm border border-blue-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              {editedScheduledAt && (
                <button
                  onClick={() => setEditedScheduledAt("")}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleSaveEdit}
              disabled={loading}
              className="btn-primary py-1.5 text-xs"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                setEditMode(false);
                setEditedContent(post.content);
                setEditedScheduledAt(post.scheduled_at ?? "");
              }}
              className="btn-secondary py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {editedContent}
        </p>
      )}

      {/* Leonardo AI image generation (hustle posts only) */}
      {!!(post.metadata as Record<string, unknown>)?.image_prompt && (
        <div className="mt-3 border border-purple-100 rounded-lg p-3 bg-purple-50/50">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowImagePrompt(!showImagePrompt)}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors"
            >
              <ImageIcon className="w-3 h-3" />
              Leonardo AI image prompt
              {showImagePrompt ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={handleGenerateImage}
              disabled={generatingImage}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 transition-colors"
            >
              {generatingImage ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Generating...
                </>
              ) : imageUrl ? (
                <>
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3" />
                  Generate Image
                </>
              )}
            </button>
          </div>

          {showImagePrompt && (
            <div className="mt-2 p-2 bg-white border border-purple-100 rounded text-xs text-purple-900 leading-relaxed font-mono select-all">
              {String((post.metadata as Record<string, unknown>).image_prompt)}
            </div>
          )}

          {imageError && (
            <p className="mt-2 text-xs text-red-600">{imageError}</p>
          )}

          {imageUrl && !generatingImage && (
            <div className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="AI-generated post image"
                className="rounded-lg w-full max-w-sm object-cover border border-purple-200"
              />
              <p className="text-xs text-purple-500 mt-1">
                Image will be attached when this post is published.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Leonardo Reel video generation */}
      {isReel && (
        <div className="mt-3 border border-pink-100 rounded-lg p-3 bg-pink-50/50">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs text-pink-700 font-medium">
              🎬 Leonardo Motion SVD — ~4 sec Reel
            </span>
            {/* Show generate button only when idle or complete */}
            {videoPhase === "idle" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRetrieveMode(!retrieveMode)}
                  className="text-xs text-pink-500 underline hover:text-pink-700"
                  title="Already generated on Leonardo? Paste the URL to retrieve it"
                >
                  Retrieve existing
                </button>
                <button
                  onClick={handleGenerateVideo}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-pink-600 text-white hover:bg-pink-700 transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  Generate Reel Video
                </button>
              </div>
            )}
            {videoPhase === "complete" && (
              <button
                onClick={handleRegenerateVideo}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-pink-600 text-white hover:bg-pink-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate Video
              </button>
            )}
          </div>

          <div className="mt-1 text-xs text-pink-600">
            Prompt: <span className="italic">{String((post.metadata as Record<string, unknown>).video_prompt ?? "")}</span>
            {" · "}Model: <strong>{String((post.metadata as Record<string, unknown>).video_quality ?? "MOTION2FAST")}</strong>
          </div>

          {/* Progress indicators */}
          {(videoPhase === "generating_image" || videoPhase === "image") && (
            <div className="mt-2 flex items-center gap-2 text-xs text-pink-600">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Step 1/2: Generating source image…
            </div>
          )}
          {(videoPhase === "generating_video" || videoPhase === "video") && (
            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-pink-600">
                <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
                Step 2/2: Animating video… (up to ~4 min, checking every 5 s)
              </div>
              <button
                onClick={() => setRetrieveMode(!retrieveMode)}
                className="flex-shrink-0 text-xs text-pink-500 underline hover:text-pink-800"
                title="Video finished on Leonardo but not showing? Paste the URL here."
              >
                Already done? Paste URL
              </button>
            </div>
          )}

          {videoError && (
            <div className="mt-2">
              <p className="text-xs text-red-600">{videoError}</p>
              {!retrieveMode && (
                <button
                  onClick={() => setRetrieveMode(true)}
                  className="mt-1 text-xs text-pink-600 underline hover:text-pink-800"
                >
                  Already generated on Leonardo? Paste URL to retrieve
                </button>
              )}
            </div>
          )}

          {/* Retrieve from Leonardo URL */}
          {retrieveMode && !videoUrl && (
            <div className="mt-2">
              <p className="text-xs text-pink-700 mb-1">Paste the Leonardo generation URL:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={retrieveInput}
                  onChange={(e) => setRetrieveInput(e.target.value)}
                  placeholder="https://app.leonardo.ai/generation/video/..."
                  className="flex-1 text-xs border border-pink-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-pink-400 focus:border-transparent"
                />
                <button
                  onClick={handleRetrieve}
                  disabled={retrieving || !retrieveInput.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-60 transition-colors"
                >
                  {retrieving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  {retrieving ? "Retrieving…" : "Retrieve"}
                </button>
                <button onClick={() => { setRetrieveMode(false); setRetrieveInput(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            </div>
          )}

          {videoUrl && videoPhase === "complete" && (
            <div className="mt-3">
              <video
                src={videoUrl}
                controls
                loop
                muted
                playsInline
                className="rounded-lg w-full max-w-sm border border-pink-200"
              />
              <p className="text-xs text-pink-500 mt-1">
                Video will be published as a Facebook Reel.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Agent notes (collapsible) */}
      {post.agent_notes && (
        <div className="mt-3">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Bot className="w-3 h-3" />
            Agent reasoning
            {showNotes ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {showNotes && (
            <div className="mt-2 p-3 bg-purple-50 rounded-lg text-xs text-purple-800 leading-relaxed">
              {post.agent_notes}
            </div>
          )}
        </div>
      )}

      {/* Rejection reason */}
      {post.rejected_reason && (
        <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-700">
          <strong>Rejection reason:</strong> {post.rejected_reason}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Footer actions */}
      {(canApprove || canPostNow || canReject || ["draft", "rejected"].includes(currentStatus)) && !editMode && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          {canApprove && (
            <button
              onClick={() => handleApprove(false)}
              disabled={loading}
              className="btn-success"
              title={post.scheduled_at ? `Schedule for ${new Date(post.scheduled_at).toLocaleString()}` : "Approve & publish immediately"}
            >
              <Send className="w-4 h-4" />
              {loading ? "Working..." : post.scheduled_at ? "Approve & Schedule" : "Approve & Publish"}
            </button>
          )}

          {canPostNow && (
            <button
              onClick={() => handleApprove(true)}
              disabled={loading}
              className="btn-primary"
              title="Publish to Facebook right now, ignoring scheduled time"
            >
              <Zap className="w-4 h-4" />
              {loading ? "Working..." : "Post Now"}
            </button>
          )}

          {canReject && (
            <button
              onClick={handleReject}
              disabled={loading}
              className="btn-danger"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          )}

          {["draft", "rejected"].includes(currentStatus) && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="btn-secondary text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
