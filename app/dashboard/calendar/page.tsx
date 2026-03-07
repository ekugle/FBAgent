import { createServerClient } from "@/lib/supabase";
import { Calendar } from "lucide-react";
import { getCurrentWeekMonday, SLOT_HOURS_CT } from "@/lib/content-generator";
import CalendarControls from "@/components/CalendarControls";
import UrlManager from "@/components/UrlManager";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_LABELS = ["7:00 AM", "12:00 PM", "5:00 PM"];

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

interface Props {
  searchParams: Promise<{ week?: string }>;
}

// Suppress unused import warning for SLOT_HOURS_CT (used implicitly via slotToUtcISO)
void SLOT_HOURS_CT;

export default async function CalendarPage({ searchParams }: Props) {
  const { week } = await searchParams;

  // Parse week start or default to current Monday
  let monday: Date;
  if (week) {
    monday = new Date(week + "T00:00:00Z");
  } else {
    monday = getCurrentWeekMonday();
  }

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7);

  const db = createServerClient();

  // Fetch posts scheduled this week
  const { data: posts } = await db
    .from("posts")
    .select("*")
    .gte("scheduled_at", monday.toISOString())
    .lt("scheduled_at", sunday.toISOString())
    .order("scheduled_at", { ascending: true });

  // Fetch URLs for manager
  const { data: urls } = await db
    .from("word_post_urls")
    .select("*")
    .order("created_at", { ascending: true });

  // Build slot map: "dayIndex-slotIndex" -> post
  type PostRow = NonNullable<typeof posts>[number];
  const slotMap: Record<string, PostRow> = {};
  for (const post of posts ?? []) {
    const meta = post.metadata as Record<string, unknown>;
    if (
      typeof meta?.day_index === "number" &&
      typeof meta?.slot_index === "number" &&
      meta?.week_start === monday.toISOString().split("T")[0]
    ) {
      slotMap[`${meta.day_index}-${meta.slot_index}`] = post;
    }
  }

  const weekStartStr = monday.toISOString().split("T")[0];
  const prevWeekStr = new Date(
    monday.getTime() - 7 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];
  const nextWeekStr = new Date(
    monday.getTime() + 7 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  const totalFilled = Object.keys(slotMap).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-500" />
            Content Calendar
          </h1>
          <p className="text-gray-500 mt-1">
            Week of{" "}
            {monday.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
            {" "}·{" "}
            <span className="text-blue-600 font-medium">{totalFilled}/21</span> slots filled
          </p>
        </div>
        <CalendarControls
          weekStart={weekStartStr}
          prevWeek={prevWeekStr}
          nextWeek={nextWeekStr}
          totalFilled={totalFilled}
        />
      </div>

      {/* Calendar Grid */}
      <div className="card overflow-hidden mb-8">
        {/* Day headers */}
        <div className="grid grid-cols-8 bg-gray-50 border-b border-gray-200">
          <div className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            CT Time
          </div>
          {DAY_NAMES.map((day, i) => {
            const date = new Date(monday);
            date.setUTCDate(monday.getUTCDate() + i);
            const isToday =
              date.toISOString().split("T")[0] ===
              new Date().toISOString().split("T")[0];
            return (
              <div
                key={day}
                className={`px-2 py-3 text-center border-l border-gray-200 ${
                  isToday ? "bg-blue-50" : ""
                }`}
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

        {/* Slot rows */}
        {SLOT_LABELS.map((slotLabel, slotIdx) => (
          <div
            key={slotIdx}
            className="grid grid-cols-8 border-b border-gray-100 last:border-0"
          >
            {/* Time label */}
            <div className="px-3 py-4 bg-gray-50 border-r border-gray-200 flex items-center">
              <span className="text-xs font-semibold text-gray-500">{slotLabel}</span>
            </div>

            {/* Day cells */}
            {DAY_NAMES.map((_, dayIdx) => {
              const post = slotMap[`${dayIdx}-${slotIdx}`];
              const meta = post?.metadata as Record<string, unknown> | undefined;
              const isHustle = meta?.post_type === "hustle";

              return (
                <div
                  key={dayIdx}
                  className="px-2 py-3 border-l border-gray-100 min-h-[140px] hover:bg-gray-50 transition-colors"
                >
                  {post ? (
                    <div className="space-y-1.5 h-full">
                      {/* Type + Status badges */}
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`badge text-xs ${
                            isHustle
                              ? "bg-orange-100 text-orange-700"
                              : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {isHustle ? "💪 Hustle" : "🔗 Word"}
                        </span>
                        <span
                          className={`badge text-xs ${
                            STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_LABELS[post.status] ?? post.status}
                        </span>
                      </div>

                      {/* Business or URL label */}
                      {isHustle && meta?.business && (
                        <div className="text-xs font-semibold text-orange-800 capitalize">
                          {String(meta.business)}
                        </div>
                      )}
                      {!isHustle && meta?.url_label && (
                        <div className="text-xs font-semibold text-sky-800">
                          {String(meta.url_label)}{" "}
                          <span className="font-normal text-sky-600">
                            · {String(meta.angle ?? "").replace("_", " ")}
                          </span>
                        </div>
                      )}

                      {/* Content preview */}
                      <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                        {post.content.slice(0, 120)}
                        {post.content.length > 120 ? "…" : ""}
                      </p>

                      {/* Image prompt indicator */}
                      {isHustle && meta?.image_prompt && (
                        <div className="text-xs text-purple-600 italic line-clamp-2">
                          🎨{" "}
                          {String(meta.image_prompt).slice(0, 80)}
                          {String(meta.image_prompt).length > 80 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full min-h-[100px] flex items-center justify-center">
                      <span className="text-xs text-gray-300">Empty</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* URL Manager */}
      <UrlManager initialUrls={urls ?? []} />
    </div>
  );
}
