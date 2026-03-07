/**
 * Pure scheduling utilities and content config — no server-only imports.
 * Safe to use in both server components and client components.
 */

// ─── Business roster ──────────────────────────────────────────────────────────

export const HUSTLE_BUSINESSES = [
  "plumber",
  "DJ",
  "hair stylist",
  "landscaper",
  "mobile mechanic",
  "house painter",
  "photographer",
  "personal trainer",
  "pet groomer",
  "private chef",
  "junk removal specialist",
  "web designer",
  "electrician",
  "HVAC technician",
  "pressure washer",
  "handyman",
  "dog walker",
  "makeup artist",
  "tattoo artist",
  "catering company",
] as const;

export const WORD_POST_ANGLES = ["pain_point", "aspirational", "feature"] as const;
export type WordPostAngle = (typeof WORD_POST_ANGLES)[number];
export type PostType = "hustle" | "word";

export interface SlotPlan {
  dayIndex: number;    // 0 = Monday, 6 = Sunday
  slotIndex: number;   // 0 = 7 AM, 1 = 12 PM, 2 = 5 PM
  postType: PostType;
  angle?: WordPostAngle;
  business?: string;
  url?: string;
  urlLabel?: string;
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

/** Posting hours in Central Time (24h) */
export const SLOT_HOURS_CT = [7, 12, 17] as const;
export const SLOT_LABELS = ["7:00 AM", "12:00 PM", "5:00 PM"] as const;

/**
 * Convert a CT slot on a given Monday into a UTC ISO string.
 * Uses CDT offset (UTC−5) for March–November. Change to 6 for CST.
 */
export function slotToUtcISO(
  mondayDate: Date,
  dayIndex: number,
  slotIndex: number
): string {
  const CT_OFFSET_HOURS = 5; // CDT = UTC-5
  const d = new Date(mondayDate);
  d.setUTCDate(d.getUTCDate() + dayIndex);
  d.setUTCHours(SLOT_HOURS_CT[slotIndex] + CT_OFFSET_HOURS, 0, 0, 0);
  return d.toISOString();
}

/** Returns the Monday of the current UTC week. */
export function getCurrentWeekMonday(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

// ─── Mix-logic ────────────────────────────────────────────────────────────────

/** Builds a 21-slot type sequence satisfying all mix constraints. */
export function buildTypeSequence(): PostType[] {
  const seq: PostType[] = [];
  while (seq.length < 21) {
    const hustleCount = seq.filter((t) => t === "hustle").length;
    const last2 = seq.slice(-2);
    const canHustle = !(last2[0] === "hustle" && last2[1] === "hustle");
    const canWord = !(last2[0] === "word" && last2[1] === "word");
    const ratio = hustleCount / (seq.length || 1);

    let type: PostType;
    if (!canHustle) type = "word";
    else if (!canWord) type = "hustle";
    else if (ratio < 0.45) type = "hustle";
    else if (ratio > 0.55) type = "word";
    else type = Math.random() < 0.5 ? "hustle" : "word";

    seq.push(type);
  }
  return seq;
}

/** Assigns businesses and URLs to each slot, respecting repetition rules. */
export function buildWeekPlan(
  typeSequence: PostType[],
  usedBusinessesThisWeek: string[],
  urls: Array<{ url: string; label: string }>
): SlotPlan[] {
  const plan: SlotPlan[] = [];
  const usedBusinesses = [...usedBusinessesThisWeek];
  const usedUrlsByDay: Record<number, string[]> = {};
  let angleIdx = 0;

  for (let day = 0; day < 7; day++) {
    usedUrlsByDay[day] = [];
    for (let slot = 0; slot < 3; slot++) {
      const postType = typeSequence[day * 3 + slot];
      const item: SlotPlan = { dayIndex: day, slotIndex: slot, postType };

      if (postType === "hustle") {
        const available = (HUSTLE_BUSINESSES as readonly string[]).filter(
          (b) => !usedBusinesses.includes(b)
        );
        const pool = available.length > 0 ? available : (HUSTLE_BUSINESSES as readonly string[]);
        item.business = pool[Math.floor(Math.random() * pool.length)];
        usedBusinesses.push(item.business);
      } else {
        item.angle = WORD_POST_ANGLES[angleIdx % WORD_POST_ANGLES.length];
        angleIdx++;
        if (urls.length > 0) {
          const available = urls.filter(
            (u) => !usedUrlsByDay[day].includes(u.url)
          );
          const pool = available.length > 0 ? available : urls;
          const picked = pool[Math.floor(Math.random() * pool.length)];
          item.url = picked.url;
          item.urlLabel = picked.label;
          usedUrlsByDay[day].push(picked.url);
        }
      }
      plan.push(item);
    }
  }
  return plan;
}
