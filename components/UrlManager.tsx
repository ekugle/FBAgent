"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus, Trash2, ExternalLink } from "lucide-react";

interface UrlRow {
  id: string;
  url: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

interface Props {
  initialUrls: UrlRow[];
}

export default function UrlManager({ initialUrls }: Props) {
  const router = useRouter();
  const [urls, setUrls] = useState(initialUrls.filter((u) => u.is_active));
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/content/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl, label: newLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add URL");
      setUrls((prev) => [...prev, data.url]);
      setNewUrl("");
      setNewLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding URL");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this URL from the word post rotation?")) return;
    try {
      const res = await fetch(`/api/content/urls?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      setUrls((prev) => prev.filter((u) => u.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error removing URL");
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Link2 className="w-4 h-4 text-sky-500" />
        Word Post URL Rotation
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        These URLs rotate through word posts. No same URL appears twice in the same day.
      </p>

      {/* URL list */}
      <div className="space-y-2 mb-6">
        {urls.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No URLs in rotation.</p>
        ) : (
          urls.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-100"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="badge bg-sky-100 text-sky-700 flex-shrink-0">
                  {u.label}
                </span>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-600 hover:text-blue-600 truncate flex items-center gap-1"
                >
                  {u.url}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
              <button
                onClick={() => handleRemove(u.id)}
                className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 ml-3"
                title="Remove from rotation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add new URL form */}
      <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label (e.g. Invoicing)"
          required
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-400 focus:border-transparent w-40"
        />
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://tx2pay.com/..."
          required
          className="flex-1 min-w-[200px] text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-400 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={adding}
          className="btn-primary bg-sky-600 hover:bg-sky-700"
        >
          <Plus className="w-4 h-4" />
          {adding ? "Adding…" : "Add URL"}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
