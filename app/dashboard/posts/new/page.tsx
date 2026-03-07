"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Bot, ArrowLeft, Send, Zap } from "lucide-react";
import Link from "next/link";
import { HUSTLE_BUSINESSES, WORD_POST_ANGLES } from "@/lib/post-schedule";

interface UrlRow {
  id: string;
  url: string;
  label: string;
}

export default function NewPostPage() {
  const router = useRouter();

  // Manual form state
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI generation state
  const [postType, setPostType] = useState<"hustle" | "word">("hustle");
  const [business, setBusiness] = useState<string>(HUSTLE_BUSINESSES[0]);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [selectedUrlLabel, setSelectedUrlLabel] = useState("");
  const [angle, setAngle] = useState<"pain_point" | "aspirational" | "feature">("pain_point");
  const [urls, setUrls] = useState<UrlRow[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const charCount = content.length;
  const charColor =
    charCount > 400 ? "text-red-500" : charCount > 280 ? "text-amber-500" : "text-gray-400";

  // Load word-post URLs
  useEffect(() => {
    fetch("/api/content/urls")
      .then((r) => r.json())
      .then((d) => {
        if (d.urls?.length) {
          setUrls(d.urls);
          setSelectedUrl(d.urls[0].url);
          setSelectedUrlLabel(d.urls[0].label);
        }
      })
      .catch(() => null);
  }, []);

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

  async function handleGenerate() {
    setGenLoading(true);
    setGenError(null);
    try {
      const body =
        postType === "hustle"
          ? { post_type: "hustle", business, scheduled_at: scheduledAt || undefined }
          : {
              post_type: "word",
              url: selectedUrl,
              url_label: selectedUrlLabel,
              angle,
              scheduled_at: scheduledAt || undefined,
            };

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      router.push("/dashboard/posts?status=pending_approval");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation error");
    } finally {
      setGenLoading(false);
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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-500" />
          New Post Draft
        </h1>
      </div>

      {/* ── AI Generation ──────────────────────────────────────────────────── */}
      <div className="card p-5 mb-6 bg-purple-50 border-purple-200">
        <h2 className="font-semibold text-purple-900 flex items-center gap-2 mb-4">
          <Bot className="w-4 h-4" />
          Generate with Claude
        </h2>

        {/* Post type toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPostType("hustle")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              postType === "hustle"
                ? "bg-orange-500 border-orange-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-orange-300"
            }`}
          >
            💪 Hustle Campaign
          </button>
          <button
            onClick={() => setPostType("word")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              postType === "word"
                ? "bg-sky-500 border-sky-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-sky-300"
            }`}
          >
            🔗 Word Post
          </button>
        </div>

        {/* Hustle options */}
        {postType === "hustle" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">
                Service Business
              </label>
              <select
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              >
                {HUSTLE_BUSINESSES.map((b) => (
                  <option key={b} value={b}>
                    {b.charAt(0).toUpperCase() + b.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-purple-700">
              Generates a "You Do The Hustle, We Get You Paid" campaign post with a Leonardo AI image prompt.
            </p>
          </div>
        )}

        {/* Word post options */}
        {postType === "word" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">
                TX2Pay Page
              </label>
              <select
                value={selectedUrl}
                onChange={(e) => {
                  setSelectedUrl(e.target.value);
                  const row = urls.find((u) => u.url === e.target.value);
                  if (row) setSelectedUrlLabel(row.label);
                }}
                className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              >
                {urls.map((u) => (
                  <option key={u.id} value={u.url}>
                    {u.label} — {u.url}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">
                Angle
              </label>
              <select
                value={angle}
                onChange={(e) =>
                  setAngle(e.target.value as typeof angle)
                }
                className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              >
                {WORD_POST_ANGLES.map((a) => (
                  <option key={a} value={a}>
                    {a.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Optional schedule time */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-purple-800 mb-1">
            Schedule time (optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16)}
            className="text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
        </div>

        {genError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {genError}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={genLoading}
          className="mt-4 btn-primary bg-purple-600 hover:bg-purple-700 w-full justify-center"
        >
          <Zap className="w-4 h-4" />
          {genLoading ? "Generating…" : "Generate & Add to Approval Queue"}
        </button>
      </div>

      <div className="text-center text-sm text-gray-400 mb-6">— or write it yourself —</div>

      {/* ── Manual form ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Post Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="Write your Facebook post here…"
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
            min={new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
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
            {loading ? "Submitting…" : "Submit for Approval"}
          </button>
          <Link href="/dashboard/posts" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
