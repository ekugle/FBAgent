"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles, Loader2, CheckCircle } from "lucide-react";
import Link from "next/link";

interface Props {
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  totalFilled: number;
}

export default function CalendarControls({
  weekStart,
  prevWeek,
  nextWeek,
  totalFilled,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    posts_created: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateWeek() {
    if (
      totalFilled > 0 &&
      !confirm(
        `This week already has ${totalFilled} post(s) scheduled. Generate the remaining ${21 - totalFilled} empty slots?\n\nNote: existing posts will not be touched.`
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/content/generate-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      setResult({ posts_created: data.posts_created, failed: data.failed ?? 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <Link
          href={`/dashboard/calendar?week=${prevWeek}`}
          className="btn-secondary py-1.5 px-2"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <Link
          href={`/dashboard/calendar?week=${nextWeek}`}
          className="btn-secondary py-1.5 px-2"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Result / error inline */}
      {result && (
        <span className="text-sm text-emerald-600 flex items-center gap-1">
          <CheckCircle className="w-4 h-4" />
          {result.posts_created} posts created
          {result.failed > 0 && (
            <span className="text-amber-600"> · {result.failed} failed</span>
          )}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}

      {/* Generate Week button */}
      <button
        onClick={handleGenerateWeek}
        disabled={loading}
        className="btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating… (may take ~60s)
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Week
          </>
        )}
      </button>
    </div>
  );
}
