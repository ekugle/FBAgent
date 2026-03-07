"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles, Loader2, CheckCircle, Settings, X } from "lucide-react";
import Link from "next/link";

interface Props {
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  totalFilled: number;
}

/** Format a number hour (0-23) as HH:MM for a time input */
function hourToTimeInput(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
function timeInputToHour(val: string): number {
  return parseInt(val.split(":")[0], 10);
}

export default function CalendarControls({
  weekStart,
  prevWeek,
  nextWeek,
  totalFilled,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [slotHours, setSlotHours] = useState<[number, number, number]>([7, 12, 18]);
  const [result, setResult] = useState<{
    posts_created: number;
    failed: number;
    skipped_past?: number;
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
    setShowConfig(false);

    try {
      const res = await fetch("/api/content/generate-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, slot_hours: slotHours }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      setResult({
        posts_created: data.posts_created,
        failed: data.failed ?? 0,
        skipped_past: data.skipped_past ?? 0,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap relative">
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
          {(result.failed ?? 0) > 0 && (
            <span className="text-amber-600"> · {result.failed} failed</span>
          )}
          {(result.skipped_past ?? 0) > 0 && (
            <span className="text-gray-400"> · {result.skipped_past} past slots skipped</span>
          )}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}

      {/* Config panel */}
      {showConfig && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-5 w-72">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Week Schedule (CT)</h3>
            <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 mb-5">
            {(["Morning", "Afternoon", "Evening"] as const).map((label, i) => (
              <div key={i} className="flex items-center justify-between">
                <label className="text-xs text-gray-600 w-24">
                  Slot {i + 1} · {label}
                </label>
                <input
                  type="time"
                  value={hourToTimeInput(slotHours[i])}
                  onChange={(e) => {
                    const h = timeInputToHour(e.target.value);
                    const next: [number, number, number] = [...slotHours] as [number, number, number];
                    next[i] = h;
                    setSlotHours(next);
                  }}
                  className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Slots in the past will be skipped automatically.
          </p>

          <button
            onClick={handleGenerateWeek}
            disabled={loading}
            className="w-full btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50 justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating… (~60s)
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Week
              </>
            )}
          </button>
        </div>
      )}

      {/* Generate Week button */}
      <button
        onClick={() => setShowConfig((v) => !v)}
        disabled={loading}
        className="btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Week
            <Settings className="w-3 h-3 opacity-60" />
          </>
        )}
      </button>
    </div>
  );
}
