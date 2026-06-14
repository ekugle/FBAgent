"use client";

import { useState } from "react";
import QuickPostSlot from "./QuickPostSlot";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_LABELS = ["7:00 AM", "12:00 PM", "5:00 PM"];
const SLOT_UTC_HOURS = [12, 17, 22];

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-600",
};
const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  draft: "Draft",
};

// Only these statuses can be dragged to reschedule
const DRAGGABLE = new Set(["pending_approval", "draft", "scheduled"]);

type PostRow = {
  id: string;
  content: string;
  status: string;
  scheduled_at: string | null;
  metadata: unknown;
};

function getSlotKey(
  scheduledAt: string,
  weekStart: Date
): { dayIndex: number; slotIndex: number } | null {
  const postDate = new Date(scheduledAt);
  const msInDay = 24 * 60 * 60 * 1000;
  const dayIndex = Math.floor(
    (postDate.getTime() - weekStart.getTime()) / msInDay
  );
  if (dayIndex < 0 || dayIndex > 6) return null;

  const ctParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).formatToParts(postDate);
  const ctHour = parseInt(
    ctParts.find((p) => p.type === "hour")?.value ?? "12"
  );
  const slotIndex = ctHour < 10 ? 0 : ctHour < 15 ? 1 : 2;
  return { dayIndex, slotIndex };
}

interface Props {
  initialPosts: PostRow[];
  monday: string; // "YYYY-MM-DD"
}

export default function CalendarGrid({ initialPosts, monday: mondayStr }: Props) {
  const [posts, setPosts] = useState<PostRow[]>(initialPosts);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const monday = new Date(mondayStr + "T00:00:00Z");
  const today = new Date().toISOString().split("T")[0];

  // Recompute slot map from live post state (enables optimistic updates)
  const slotMap: Record<string, PostRow[]> = {};
  for (const post of posts) {
    if (!post.scheduled_at) continue;
    const slot = getSlotKey(post.scheduled_at, monday);
    if (!slot) continue;
    const key = `${slot.dayIndex}-${slot.slotIndex}`;
    (slotMap[key] ??= []).push(post);
  }

  function handleDragStart(e: React.DragEvent, postId: string) {
    e.dataTransfer.setData("postId", postId);
    e.dataTransfer.effectAllowed = "move";
  }

  async function handleDrop(
    e: React.DragEvent,
    dayIdx: number,
    slotIdx: number
  ) {
    e.preventDefault();
    setDragOverSlot(null);

    const postId = e.dataTransfer.getData("postId");
    if (!postId) return;

    const slotDate = new Date(monday);
    slotDate.setUTCDate(monday.getUTCDate() + dayIdx);
    slotDate.setUTCHours(SLOT_UTC_HOURS[slotIdx], 0, 0, 0);
    const newScheduledAt = slotDate.toISOString();

    const post = posts.find((p) => p.id === postId);
    if (!post || post.scheduled_at === newScheduledAt) return;

    const prevScheduledAt = post.scheduled_at;

    // Optimistic move
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, scheduled_at: newScheduledAt } : p
      )
    );
    setSavingId(postId);
    setFlashError(null);

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", scheduled_at: newScheduledAt }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Reschedule failed");
      }
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, scheduled_at: prevScheduledAt } : p
        )
      );
      const msg = err instanceof Error ? err.message : "Reschedule failed";
      setFlashError(msg);
      setTimeout(() => setFlashError(null), 4000);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      {flashError && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {flashError}
        </div>
      )}

      <div className="card overflow-hidden mb-8">
        {/* Day header row */}
        <div className="grid grid-cols-8 bg-gray-50 border-b border-gray-200">
          <div className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            CT Time
          </div>
          {DAY_NAMES.map((day, i) => {
            const date = new Date(monday);
            date.setUTCDate(monday.getUTCDate() + i);
            const dateStr = date.toISOString().split("T")[0];
            const isToday = dateStr === today;
            return (
              <div
                key={day}
                className={`px-2 py-3 text-center border-l border-gray-200 ${isToday ? "bg-blue-50" : ""}`}
              >
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isToday ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  {day}
                </div>
                <div
                  className={`text-sm font-bold ${
                    isToday ? "text-blue-700" : "text-gray-700"
                  }`}
                >
                  {date.getUTCDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time slot rows */}
        {SLOT_LABELS.map((slotLabel, slotIdx) => (
          <div
            key={slotIdx}
            className="grid grid-cols-8 border-b border-gray-100 last:border-0"
          >
            <div className="px-3 py-4 bg-gray-50 border-r border-gray-200 flex items-center">
              <span className="text-xs font-semibold text-gray-500">
                {slotLabel}
              </span>
            </div>

            {DAY_NAMES.map((_, dayIdx) => {
              const slotKey = `${dayIdx}-${slotIdx}`;
              const slotPosts = slotMap[slotKey] ?? [];
              const isDragOver = dragOverSlot === slotKey;

              const slotDate = new Date(monday);
              slotDate.setUTCDate(monday.getUTCDate() + dayIdx);
              slotDate.setUTCHours(SLOT_UTC_HOURS[slotIdx], 0, 0, 0);
              const slotDatetime = slotDate.toISOString();

              const dayDate = new Date(monday);
              dayDate.setUTCDate(monday.getUTCDate() + dayIdx);
              const slotLabelStr = `${DAY_NAMES[dayIdx]} ${dayDate.toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", timeZone: "UTC" }
              )} · ${SLOT_LABELS[slotIdx]}`;

              return (
                <div
                  key={dayIdx}
                  className={`px-2 py-2 border-l border-gray-100 min-h-[130px] transition-colors relative ${
                    isDragOver
                      ? "bg-blue-50 ring-2 ring-inset ring-blue-400"
                      : "hover:bg-gray-50"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverSlot(slotKey);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverSlot(null);
                    }
                  }}
                  onDrop={(e) => handleDrop(e, dayIdx, slotIdx)}
                >
                  {isDragOver && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded">
                        Drop to reschedule
                      </span>
                    </div>
                  )}

                  {slotPosts.length > 0 ? (
                    <div className="space-y-2">
                      {slotPosts.map((post) => {
                        const meta = post.metadata as
                          | Record<string, unknown>
                          | undefined;
                        const isDraggable = DRAGGABLE.has(post.status);
                        const isSaving = savingId === post.id;

                        return (
                          <div
                            key={post.id}
                            draggable={isDraggable}
                            onDragStart={
                              isDraggable
                                ? (e) => handleDragStart(e, post.id)
                                : undefined
                            }
                            title={
                              isDraggable
                                ? "Drag to reschedule"
                                : "Published posts can't be rescheduled"
                            }
                            className={`space-y-1 rounded transition-opacity ${
                              isDraggable
                                ? "cursor-grab active:cursor-grabbing select-none"
                                : "cursor-default"
                            } ${isSaving ? "opacity-40" : ""}`}
                          >
                            <div className="flex flex-wrap gap-1">
                              <span
                                className={`badge text-xs ${
                                  STATUS_COLORS[post.status] ??
                                  "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {STATUS_LABELS[post.status] ?? post.status}
                              </span>
                              {!!meta?.post_type && (
                                <span
                                  className={`badge text-xs ${
                                    String(meta.post_type) === "hustle"
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-sky-100 text-sky-700"
                                  }`}
                                >
                                  {String(meta.post_type) === "hustle"
                                    ? "Hustle"
                                    : "Word"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                              {post.content.slice(0, 110)}
                              {post.content.length > 110 ? "…" : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <QuickPostSlot
                      slotDatetime={slotDatetime}
                      slotLabel={slotLabelStr}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
