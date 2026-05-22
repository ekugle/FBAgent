"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";

interface Props {
  /** ISO 8601 datetime for this slot (pre-filled in the form) */
  slotDatetime: string;
  /** Human-readable label e.g. "Mon May 19 · 9:00 AM" */
  slotLabel: string;
}

export default function QuickPostSlot({ slotDatetime, slotLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState(
    // Convert ISO to datetime-local format (YYYY-MM-DDTHH:mm)
    slotDatetime.slice(0, 16)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create post");
      setOpen(false);
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="h-full min-h-[100px] flex items-center justify-center">
        <button
          onClick={() => setOpen(true)}
          className="w-7 h-7 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-blue-400 hover:text-blue-400 transition-colors"
          title={`Add post for ${slotLabel}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">New Post</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">{slotLabel}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={5}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                  placeholder="Write your post content…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading || !content.trim()}
                  className="btn-primary flex-1 justify-center"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {loading ? "Saving…" : "Add to Post Queue"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
