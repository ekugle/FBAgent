/**
 * Pure scheduling utilities and content config — no server-only imports.
 * Safe to use in both server components and client components.
 */

// ─── Business roster (grouped by vertical) ────────────────────────────────────

export const HUSTLE_BUSINESSES_BY_VERTICAL: Record<string, string[]> = {
  home_trades: [
    "plumber",
    "electrician",
    "HVAC technician",
    "handyman",
    "roofer",
    "drywall contractor",
    "tile setter",
    "flooring installer",
    "insulation contractor",
    "fence installer",
  ],
  outdoor_home: [
    "house painter",
    "pressure washer",
    "landscaper",
    "lawn care specialist",
    "tree trimmer",
    "gutter cleaner",
    "pool cleaner",
    "irrigation specialist",
    "snow removal service",
    "window cleaner",
  ],
  automotive: [
    "mobile mechanic",
    "auto detailer",
    "windshield repair technician",
    "tow truck operator",
    "mobile tire technician",
    "car wrap installer",
  ],
  health_wellness: [
    "personal trainer",
    "massage therapist",
    "yoga instructor",
    "nutritionist",
    "life coach",
    "chiropractor",
    "acupuncturist",
  ],
  beauty_care: [
    "hair stylist",
    "makeup artist",
    "nail technician",
    "esthetician",
    "barber",
    "tattoo artist",
    "lash technician",
    "brow specialist",
  ],
  pets: [
    "pet groomer",
    "dog walker",
    "dog trainer",
    "pet sitter",
    "mobile vet technician",
  ],
  events_entertainment: [
    "DJ",
    "photographer",
    "videographer",
    "event planner",
    "wedding officiant",
    "photo booth operator",
    "live musician",
  ],
  food_culinary: [
    "private chef",
    "food truck owner",
    "catering company",
    "cake decorator",
    "meal prep service",
    "personal baker",
  ],
  creative_digital: [
    "web designer",
    "graphic designer",
    "social media manager",
    "video editor",
    "brand photographer",
    "copywriter",
  ],
  education_coaching: [
    "music teacher",
    "private tutor",
    "sports coach",
    "dance instructor",
    "driving instructor",
    "swim instructor",
  ],
  moving_logistics: [
    "junk removal specialist",
    "moving company owner",
    "courier service",
    "furniture assembler",
  ],
  cleaning: [
    "house cleaner",
    "commercial cleaner",
    "carpet cleaner",
    "post-construction cleaner",
    "Airbnb turnover cleaner",
  ],
  security_safety: [
    "locksmith",
    "alarm system installer",
    "security camera installer",
  ],
};

/** Flat list kept for reference / backwards compat */
export const HUSTLE_BUSINESSES: readonly string[] = Object.values(
  HUSTLE_BUSINESSES_BY_VERTICAL
).flat();

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
export const SLOT_HOURS_CT = [7, 12, 18] as const;
export const SLOT_LABELS = ["7:00 AM", "12:00 PM", "6:00 PM"] as const;

/**
 * Convert a CT slot on a given Monday into a UTC ISO string.
 * Uses CDT offset (UTC−5) for March–November. Change to 6 for CST.
 * Pass custom slotHours to override the default [7, 12, 18].
 */
export function slotToUtcISO(
  mondayDate: Date,
  dayIndex: number,
  slotIndex: number,
  slotHours?: readonly number[]
): string {
  const CT_OFFSET_HOURS = 5; // CDT = UTC-5
  const hours = slotHours ?? SLOT_HOURS_CT;
  const d = new Date(mondayDate);
  d.setUTCDate(d.getUTCDate() + dayIndex);
  d.setUTCHours(hours[slotIndex] + CT_OFFSET_HOURS, 0, 0, 0);
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

/**
 * Pick a business rotating through verticals so consecutive hustle posts
 * never come from the same industry. Falls back gracefully when a vertical
 * is exhausted.
 */
function pickBusiness(
  usedBusinesses: string[],
  usedVerticalsThisWeek: string[]
): { business: string; vertical: string } {
  const verticals = Object.keys(HUSTLE_BUSINESSES_BY_VERTICAL);

  // Prefer a vertical not yet used this week; fall back to least-recently-used
  const preferredVerticals = verticals.filter(
    (v) => !usedVerticalsThisWeek.includes(v)
  );
  const candidateVerticals =
    preferredVerticals.length > 0 ? preferredVerticals : verticals;

  // Shuffle candidate verticals so we don't always pick the same first one
  const shuffled = [...candidateVerticals].sort(() => Math.random() - 0.5);

  for (const vertical of shuffled) {
    const businesses = HUSTLE_BUSINESSES_BY_VERTICAL[vertical];
    const available = businesses.filter((b) => !usedBusinesses.includes(b));
    const pool = available.length > 0 ? available : businesses;
    const business = pool[Math.floor(Math.random() * pool.length)];
    return { business, vertical };
  }

  // Absolute fallback (should never reach here)
  const all = HUSTLE_BUSINESSES as readonly string[];
  return { business: all[Math.floor(Math.random() * all.length)], vertical: "home_trades" };
}

/** Assigns businesses and URLs to each slot, respecting repetition rules. */
export function buildWeekPlan(
  typeSequence: PostType[],
  usedBusinessesRecently: string[],
  urls: Array<{ url: string; label: string }>
): SlotPlan[] {
  const plan: SlotPlan[] = [];
  const usedBusinesses = [...usedBusinessesRecently];
  const usedVerticalsThisWeek: string[] = [];
  const usedUrlsByDay: Record<number, string[]> = {};
  let angleIdx = 0;

  for (let day = 0; day < 7; day++) {
    usedUrlsByDay[day] = [];
    for (let slot = 0; slot < 3; slot++) {
      const postType = typeSequence[day * 3 + slot];
      const item: SlotPlan = { dayIndex: day, slotIndex: slot, postType };

      if (postType === "hustle") {
        const { business, vertical } = pickBusiness(usedBusinesses, usedVerticalsThisWeek);
        item.business = business;
        usedBusinesses.push(business);
        usedVerticalsThisWeek.push(vertical);
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
