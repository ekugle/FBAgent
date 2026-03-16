/**
 * POST /api/content/generate-week
 * Generates all 21 content slots for the current week (Mon–Sun × 7am/12pm/5pm CT)
 * using the hustle/word mix constraints and saves each as a pending_approval post.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getAgentMemory, setAgentMemory } from "@/lib/supabase";
import {
  generateHustlePost,
  generateWordPost,
} from "@/lib/content-generator";
import {
  buildTypeSequence,
  buildWeekPlan,
  getCurrentWeekMonday,
  slotToUtcISO,
  SlotPlan,
} from "@/lib/post-schedule";

// Allow up to 5 minutes on Vercel (21 Claude calls can take ~60s total)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // week_start: "YYYY-MM-DD" (Monday of the desired week)
    // slot_hours: [7, 12, 18] (CT hours for each of the 3 daily slots)
    const { week_start, slot_hours } = body as {
      week_start?: string;
      slot_hours?: [number, number, number];
    };

    const db = createServerClient();

    // 1. Load active word-post URLs
    const { data: urlRows } = await db
      .from("word_post_urls")
      .select("url, label")
      .eq("is_active", true);
    const urls = urlRows ?? [];

    // 2. Load hustle tracking (rolling list of recently used businesses)
    const trackingMemory = await getAgentMemory("hustle_tracking");
    const tracking = trackingMemory?.value as {
      used_recently: string[];
    } | null;

    const monday = week_start
      ? new Date(week_start + "T00:00:00Z")
      : getCurrentWeekMonday();
    const weekStartStr = monday.toISOString().split("T")[0];

    const customSlotHours: [number, number, number] = slot_hours ?? [7, 12, 18];

    // Keep the last 40 used businesses so the list stays fresh across weeks
    const usedThisWeek = tracking?.used_recently ?? [];

    // 3. Build the 21-slot plan
    const typeSequence = buildTypeSequence();
    const plan = buildWeekPlan(typeSequence, usedThisWeek, urls);

    // 4. Generate all posts — batches of 7 to avoid overwhelming the API
    type GeneratedSlot = {
      slot: SlotPlan;
      content: string;
      image_prompt?: string;
      error?: string;
    };

    const generated: GeneratedSlot[] = [];

    for (let i = 0; i < plan.length; i += 7) {
      const batch = plan.slice(i, i + 7);
      const results = await Promise.allSettled(
        batch.map(async (slot): Promise<GeneratedSlot> => {
          if (slot.postType === "hustle" && slot.business) {
            const { content, image_prompt } = await generateHustlePost(slot.business);
            return { slot, content, image_prompt };
          } else if (slot.postType === "word" && slot.url && slot.urlLabel && slot.angle) {
            const { content } = await generateWordPost(slot.url, slot.urlLabel, slot.angle);
            return { slot, content };
          }
          return { slot, content: "", error: "Missing slot data" };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          generated.push(result.value);
        } else {
          // Keep a placeholder so slot count stays consistent
          generated.push({
            slot: batch[results.indexOf(result)],
            content: "",
            error: result.reason?.message ?? "Generation failed",
          });
        }
      }
    }

    // 5. Insert all successful posts — skip any slots already in the past
    // FB requires schedule time ≥ 10 min from now; we add a small buffer.
    const cutoff = new Date(Date.now() + 10 * 60 * 1000);

    const postsToInsert = generated
      .filter((g) => g.content && !g.error)
      .map(({ slot, content, image_prompt }) => ({
        content,
        status: "pending_approval" as const,
        scheduled_at: slotToUtcISO(monday, slot.dayIndex, slot.slotIndex, customSlotHours),
        created_by: "agent",
        agent_notes:
          slot.postType === "hustle"
            ? `Hustle campaign post for ${slot.business}.`
            : `Word post (${slot.angle}) for ${slot.urlLabel}.`,
        metadata: {
          post_type: slot.postType,
          day_index: slot.dayIndex,
          slot_index: slot.slotIndex,
          week_start: weekStartStr,
          ...(slot.postType === "hustle"
            ? { business: slot.business, image_prompt: image_prompt ?? "" }
            : { url: slot.url, url_label: slot.urlLabel, angle: slot.angle }),
        },
      }))
      .filter((p) => new Date(p.scheduled_at) > cutoff);

    const { data: savedPosts, error: insertError } = await db
      .from("posts")
      .insert(postsToInsert)
      .select("id, scheduled_at, metadata");

    if (insertError) throw insertError;

    // 6. Update hustle tracking — rolling list capped at 40 entries
    const newBusinesses = generated
      .filter((g) => g.slot.postType === "hustle" && g.slot.business && !g.error)
      .map((g) => g.slot.business!);

    const updatedRecent = [
      ...new Set([...usedThisWeek, ...newBusinesses]),
    ].slice(-40);

    await setAgentMemory(
      "hustle_tracking",
      { used_recently: updatedRecent },
      "Rolling list of the last ~40 service businesses used to avoid industry repetition across weeks"
    );

    const failedCount = generated.filter((g) => g.error).length;
    const skippedCount = generated.filter(
      (g) => g.content && !g.error &&
        new Date(slotToUtcISO(monday, g.slot.dayIndex, g.slot.slotIndex, customSlotHours)) <= cutoff
    ).length;

    return NextResponse.json({
      posts_created: savedPosts?.length ?? 0,
      failed: failedCount,
      skipped_past: skippedCount,
      week_start: weekStartStr,
      slots: generated.map((g) => ({
        day: g.slot.dayIndex,
        slot: g.slot.slotIndex,
        type: g.slot.postType,
        business: g.slot.business,
        url_label: g.slot.urlLabel,
        success: !g.error,
        error: g.error,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
