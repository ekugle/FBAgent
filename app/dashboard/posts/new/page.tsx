"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Bot, ArrowLeft, Send } from "lucide-react";
import Link from "next/link";

export default function NewPostPage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicHint, setTopicHint] = useState("");

  const charCount = content.length;
  const charColor =
    charCount > 400 ? "text-red-500" : charCount > 280 ? "text-amber-500" : "text-gray-400";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          scheduled_at: scheduledAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create post");
      router.push("/dashboard/posts?status=pending_approval");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating post");
    } finally {
      setLoading(false);
    }
  }

  async function handleAgentGenerate() {
    setAgentLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: "cron_post",
          context: topicHint ? { topic_hint: topicHint } : {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Agent failed");
      // Agent creates the draft automatically — redirect to queue
      router.push("/dashboard/posts?status=pending_approval");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent error");
    } finally {
      setAgentLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/posts" className="btn-secondary">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-500" />
            New Post Draft
          </h1>
        </div>
      </div>

      {/* AI Generation shortcut */}
      <div className="card p-5 mb-6 bg-purple-50 border-purple-200">
        <h2 className="font-semibold text-purple-900 flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4" />
          Let Claude Write It
        </h2>
        <p className="text-sm text-purple-700 mb-3">
          The AI agent will generate an on-brand post, using your page analytics
          and recent content to avoid repetition.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="Topic hint (optional, e.g. 'invoicing tips')"
            className="flex-1 text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
          <button
            onClick={handleAgentGenerate}
            disabled={agentLoading}
            className="btn-primary bg-purple-600 hover:bg-purple-700"
          >
            <Bot className="w-4 h-4" />
            {agentLoading ? "Generating..." : "Generate Post"}
          </button>
        </div>
      </div>

      <div className="text-center text-sm text-gray-400 mb-6">— or write it yourself —</div>

      {/* Manual form */}
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Post Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="Write your Facebook post here...&#10;&#10;Remember:&#10;• Start with a hook&#10;• Include a CTA&#10;• Add 3-5 hashtags at the end"
            required
            className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div className={`text-right text-xs mt-1 ${charColor}`}>
            {charCount} characters
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Schedule (optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date(Date.now() + 10 * 60 * 1000)
              .toISOString()
              .slice(0, 16)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Leave blank to publish immediately upon approval
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="btn-primary"
          >
            <Send className="w-4 h-4" />
            {loading ? "Submitting..." : "Submit for Approval"}
          </button>
          <Link href="/dashboard/posts" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
