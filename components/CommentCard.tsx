"use client";

import { useState } from "react";
import { Comment, CommentResponse } from "@/lib/supabase";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Minus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SENTIMENT_CONFIG = {
  positive: {
    icon: ThumbsUp,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    label: "Positive",
  },
  neutral: {
    icon: Minus,
    color: "text-gray-500",
    bg: "bg-gray-50",
    label: "Neutral",
  },
  negative: {
    icon: ThumbsDown,
    color: "text-red-500",
    bg: "bg-red-50",
    label: "Negative",
  },
};

interface CommentCardProps {
  comment: Comment;
  responses: CommentResponse[];
}

export default function CommentCard({ comment, responses }: CommentCardProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [localResponses, setLocalResponses] = useState(responses);
  const [error, setError] = useState<string | null>(null);

  const sentiment = comment.sentiment as keyof typeof SENTIMENT_CONFIG | null;
  const sentimentConfig = sentiment ? SENTIMENT_CONFIG[sentiment] : null;

  const pendingResponse = localResponses.find(
    (r) => r.status === "draft" || r.status === "pending_approval"
  );

  async function handleApprove(response: CommentResponse) {
    setLoading(true);
    setError(null);
    const text =
      editingResponseId === response.id
        ? editedText
        : response.draft_response;

    try {
      const res = await fetch(
        `/api/comments/${comment.id}/responses`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response_id: response.id,
            action: "approve",
            final_response: text,
            approved_by: "admin",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");

      setLocalResponses((prev) =>
        prev.map((r) =>
          r.id === response.id
            ? { ...r, status: "published" as const, final_response: text }
            : r
        )
      );
      setEditingResponseId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(response: CommentResponse) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/comments/${comment.id}/responses`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response_id: response.id,
            action: "reject",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");

      setLocalResponses((prev) =>
        prev.map((r) =>
          r.id === response.id ? { ...r, status: "rejected" as const } : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      {/* Comment header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">
            {comment.commenter_name ?? "Anonymous"}
          </span>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(comment.received_at), {
              addSuffix: true,
            })}
          </span>
          {sentimentConfig && (
            <span
              className={`badge ${sentimentConfig.bg} ${sentimentConfig.color}`}
            >
              <sentimentConfig.icon className="w-3 h-3 mr-1" />
              {sentimentConfig.label}
            </span>
          )}
        </div>
        <a
          href={`https://facebook.com/${comment.fb_comment_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          View on FB
        </a>
      </div>

      {/* Comment message */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <p className="text-sm text-gray-800">{comment.message}</p>
      </div>

      {/* Responses */}
      {localResponses.length > 0 && (
        <div className="space-y-3">
          {localResponses.map((response) => (
            <div
              key={response.id}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
                  <Bot className="w-3 h-3" />
                  AI Draft Response
                </span>
                <span
                  className={`badge text-xs ${
                    response.status === "published"
                      ? "bg-emerald-100 text-emerald-700"
                      : response.status === "rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {response.status}
                </span>
              </div>

              {editingResponseId === response.id ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={4}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 resize-none"
                />
              ) : (
                <p className="text-sm text-gray-800 leading-relaxed">
                  {response.final_response ?? response.draft_response}
                </p>
              )}

              {/* Agent reasoning */}
              {response.agent_reasoning && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                  >
                    Agent reasoning
                    {showReasoning ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  {showReasoning && (
                    <div className="mt-1 p-2 bg-purple-50 rounded text-xs text-purple-800">
                      {response.agent_reasoning}
                    </div>
                  )}
                </div>
              )}

              {/* Actions for pending responses */}
              {(response.status === "draft" ||
                response.status === "pending_approval") && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  {editingResponseId === response.id ? (
                    <>
                      <button
                        onClick={() => handleApprove(response)}
                        disabled={loading}
                        className="btn-success text-xs py-1.5"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve Edited
                      </button>
                      <button
                        onClick={() => setEditingResponseId(null)}
                        className="btn-secondary text-xs py-1.5"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApprove(response)}
                        disabled={loading}
                        className="btn-success text-xs py-1.5"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve & Post
                      </button>
                      <button
                        onClick={() => {
                          setEditingResponseId(response.id);
                          setEditedText(response.draft_response);
                        }}
                        className="btn-secondary text-xs py-1.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleReject(response)}
                        disabled={loading}
                        className="btn-danger text-xs py-1.5"
                      >
                        <XCircle className="w-3 h-3" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              )}

              {response.status === "published" && response.published_at && (
                <p className="text-xs text-gray-400 mt-2">
                  Posted{" "}
                  {formatDistanceToNow(new Date(response.published_at), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {localResponses.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <MessageSquare className="w-3 h-3" />
          No response drafted yet. The agent will process this shortly.
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
