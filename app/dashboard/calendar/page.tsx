import { createServerClient } from "@/lib/supabase";
import { Calendar } from "lucide-react";
import { getCurrentWeekMonday } from "@/lib/post-schedule";
import CalendarControls from "@/components/CalendarControls";
import CalendarGrid from "@/components/CalendarGrid";
import UrlManager from "@/components/UrlManager";

interface Props {
  searchParams: Promise<{ week?: string }>;
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

  const { data: posts } = await db
    .from("posts")
    .select("id, content, status, scheduled_at, metadata")
    .gte("scheduled_at", monday.toISOString())
    .lt("scheduled_at", sunday.toISOString())
    .order("scheduled_at", { ascending: true });

  const { data: urls } = await db
    .from("word_post_urls")
    .select("*")
    .order("created_at", { ascending: true });

  const mondayStr = monday.toISOString().split("T")[0];
  const prevWeekStr = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const nextWeekStr = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Count filled slots server-side for the header
  const filledSlots = new Set<string>();
  for (const post of posts ?? []) {
    if (!post.scheduled_at) continue;
    const postDate = new Date(post.scheduled_at);
    const dayIndex = Math.floor(
      (postDate.getTime() - monday.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (dayIndex < 0 || dayIndex > 6) continue;
    const ctParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).formatToParts(postDate);
    const ctHour = parseInt(ctParts.find((p) => p.type === "hour")?.value ?? "12");
    const slotIndex = ctHour < 10 ? 0 : ctHour < 15 ? 1 : 2;
    filledSlots.add(`${dayIndex}-${slotIndex}`);
  }

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
            <span className="text-blue-600 font-medium">
              {filledSlots.size}/21
            </span>{" "}
            slots filled &middot;{" "}
            <span className="text-gray-400 text-sm">drag posts to reschedule</span>
          </p>
        </div>
        <CalendarControls
          weekStart={mondayStr}
          prevWeek={prevWeekStr}
          nextWeek={nextWeekStr}
        />
      </div>

      <CalendarGrid
        initialPosts={posts ?? []}
        monday={mondayStr}
      />

      <UrlManager initialUrls={urls ?? []} />
    </div>
  );
}
