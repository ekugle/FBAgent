import { createServerClient } from "@/lib/supabase";
import { Calendar } from "lucide-react";
import { getCurrentWeekMonday } from "@/lib/post-schedule";
import CalendarControls from "@/components/CalendarControls";
import QuickPostSlot from "@/components/QuickPostSlot";
import UrlManager from "@/components/UrlManager";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Three time rows: 7am, 12pm, 5pm CT
const SLOT_LABELS = ["7:00 AM", "12:00 PM", "5:00 PM"];
// Corresponding UTC-equivalent hour offsets for new post defaults (CDT = UTC-5)
const SLOT_UTC_HOURS = [12, 17, 22]; // 7am, 12pm, 5pm CT in CDT

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

/**
 * Derive which day column (0=Mon…6=Sun) and slot row (0/1/2) a post belongs to,
 * based purely on its scheduled_at datetime.
 */
function getSlotKey(
  scheduledAt: string,
  weekStart: Date
): { dayIndex: number; slotIndex: number } | null {
  const postDate = new Date(scheduledAt);

  // Days from Monday (UTC midnight) — floor is accurate to within a few hours
  const msInDay = 24 * 60 * 60 * 1000;
  const dayIndex = Math.floor(
    (postDate.getTime() - weekStart.getTime()) / msInDay
  );
  if (dayIndex < 0 || dayIndex > 6) return null;

  // Get the hour in America/Chicago timezone
  const ctParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).formatToParts(postDate);
  const ctHour = parseInt(ctParts.find((p) => p.type === "hour")?.value ?? "12");

  // Assign to nearest slot row
  const slotIndex = ctHour < 10 ? 0 : ctHour < 15 ? 1 : 2;

  return { dayIndex, slotIndex };
}

export default async function CalendarPage({ searchParams }: Props) {
  const { week } = await searchParams;

  let monday: Date;
  if (week) {
    monday = new Date(week + "T00:00:00Z");
  } else {
    monday = getCurrentWeekMonday();
  }

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7);

  const db = createServerClient();

  // Fetch ALL posts in the week — regardless of metadata shape
  const { data: posts } = await db
    .from("posts")
    .select("*")
    .gte("scheduled_at", monday.toISOString())
    .lt("scheduled_at", sunday.toISOString())
    .order("scheduled_at", { ascending: true });

  const { data: urls } = await db
    .from("word_post_urls")
    .select("*")
    .order("created_at", { ascending: true });

  type PostRow = NonNullable<typeof posts>[number];

  // Build slot map: each slot can hold multiple posts
  const slotMap: Record<string, PostRow[]> = {};
  for (const post of posts ?? []) {
    if (!post.scheduled_at) continue;
    const slot = getSlotKey(post.scheduled_at, monday);
    if (!slot) continue;
    const key = `${slot.dayIndex}-${slot.slotIndex}`;
    if (!slotMap[key]) slotMap[key] = [];
    slotMap[key].push(post);
  }

  const totalFilled = Object.keys(slotMap).length;

  const weekStartStr = monday.toISOString().split("T")[0];
  const prevWeekStr = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const nextWeekStr = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  return (
    <div className="p-8">
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
            })}{" "}
            &middot;{" "}
            <span className="text-blue-600 font-medium">{totalFilled}/21</span>{" "}
            slots filled
          </p>
        </div>
        <CalendarControls
          weekStart={weekStartStr}
          prevWeek={prevWeekStr}
          nextWeek={nextWeekStr}
        />
      </div>

      <div className="card overflow-hidden mb-8">
        {/* Header row */}
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
                className={`px-2 py-3 text-center border-l border-gray-200 ${isToday ? "bg-blue-50" : ""}`}
              >
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-blue-600" : "text-gray-500"}`}
                >
                  {day}
                </div>
                <div
                  className={`text-sm font-bold ${isToday ? "text-blue-700" : "text-gray-700"}`}
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
            <div className="px-3 py-4 bg-gray-50 border-r border-gray-200 flex items-center">
              <span className="text-xs font-semibold text-gray-500">{slotLabel}</span>
            </div>

            {DAY_NAMES.map((_, dayIdx) => {
              const slotPosts = slotMap[`${dayIdx}-${slotIdx}`];

              // Build a datetime for "new post" default for this slot
              const slotDate = new Date(monday);
              slotDate.setUTCDate(monday.getUTCDate() + dayIdx);
              slotDate.setUTCHours(SLOT_UTC_HOURS[slotIdx], 0, 0, 0);
              const slotDatetime = slotDate.toISOString();

              const dayDate = new Date(monday);
              dayDate.setUTCDate(monday.getUTCDate() + dayIdx);
              const slotLabel2 = `${DAY_NAMES[dayIdx]} ${dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · ${SLOT_LABELS[slotIdx]}`;

              return (
                <div
                  key={dayIdx}
                  className="px-2 py-2 border-l border-gray-100 min-h-[130px] hover:bg-gray-50 transition-colors"
                >
                  {slotPosts && slotPosts.length > 0 ? (
                    <div className="space-y-2 h-full">
                      {slotPosts.map((post) => {
                        const meta = post.metadata as Record<string, unknown> | undefined;
                        return (
                          <div key={post.id} className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              <span
                                className={`badge text-xs ${STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {STATUS_LABELS[post.status] ?? post.status}
                              </span>
                              {!!meta?.post_type && (
                                <span className={`badge text-xs ${String(meta.post_type) === "hustle" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700"}`}>
                                  {String(meta.post_type) === "hustle" ? "Hustle" : "Word"}
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
                      slotLabel={slotLabel2}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <UrlManager initialUrls={urls ?? []} />
    </div>
  );
}
