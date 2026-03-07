import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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
];

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

// Posting hours in Central Time (24h)
export const SLOT_HOURS_CT = [7, 12, 17];

/**
 * Convert a CT slot on a given Monday into a UTC ISO string.
 * Uses CDT offset (UTC−5) which covers March–November.
 * Adjust CT_OFFSET_HOURS to 6 for November–March (CST).
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
        const available = HUSTLE_BUSINESSES.filter(
          (b) => !usedBusinesses.includes(b)
        );
        const pool = available.length > 0 ? available : HUSTLE_BUSINESSES;
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

// ─── Claude prompts ───────────────────────────────────────────────────────────

const HUSTLE_SYSTEM = `You are a social media content writer for TX2Pay, a payment and invoicing platform for small service businesses. You write "You Do The Hustle, We Get You Paid" campaign posts.

EXACT POST STRUCTURE (follow precisely — never reorder, never skip):
1. Opening hook line with emojis (specific and vivid to the business)
2. 3–4 lines about their daily grind and what they actually do
3. Bridge line connecting their work to getting paid (with emoji)
4. "With TX2Pay, [short situation-specific phrase]:"
5. ✅ Send the invoice
6. ✅ They tap to pay
7. ✅ Money hits instantly
8. 2 pain point lines about life WITHOUT TX2Pay (vary the format — not always "No X. No Y.")
9. One punchy closing line before the sign-off (with emoji)
10. "You do the hustle. We get you paid." (this exact line — never change it)
11. Hashtags: 10–12 tags, always include #tx2pay and #getpaidfast

TONE: Authentic, blue-collar respectful, heavy emoji use, motivational.

EXAMPLE — plumber:
Knee-deep in a situation nobody else wanted to touch. 🪠💦
You got the call at the worst possible time — and you showed up anyway. Diagnosed it. Fixed it. Saved the whole house from a disaster nobody wants to explain to their insurance company. 😅
You do the dirty work. Getting paid should be the clean part. 🙌🏽
With TX2Pay, once the water's running right:
✅ Send the invoice
✅ They tap to pay
✅ Money hits instantly
No chasing homeowners down the driveway. No "I'll write you a check... somewhere around here."
Just fast, honest pay for skilled, honest work. 💪🏽
You do the hustle. We get you paid.
#plumberlife #plumbing #tradelife #skilledtrades #bluecollarboss #homerepair #smallbusinessowner #tx2pay #getpaidfast #entrepreneurlife #sidehustleszn #tradespeople

EXAMPLE — personal trainer:
You showed up at 5am. So did they — because you held them accountable. 🏋🏽‍♂️⏰
You built their program, tracked their progress, pushed them past every excuse they walked in with. The results on their body? That's your work. 💪🏽
You invest in people. Getting paid should never be the hardest rep of your day. 🙌🏽
With TX2Pay, session done means payment done:
✅ Send the invoice
✅ They tap to pay
✅ Money hits instantly
No chasing down clients between sets. No "I'll get you after my next paycheck."
Just instant pay for the transformation you deliver. 🔥
You do the hustle. We get you paid.
#personaltrainer #fitnessmotivation #gymlife #fitbiz #cptlife #fitnesscoach #tx2pay #getpaidfast #entrepreneurlife #sidehustleszn #fitnessbusiness #trainersofinstagram

EXAMPLE — house painter:
Every wall you touch tells a story. 🖌️🏠
You're up on the ladder before most people are out of bed — taping, prepping, rolling, cutting in edges so clean they look like they came straight from the factory.
You transform spaces. Getting paid should be just as smooth. ✨
With TX2Pay, brushes down means money up:
✅ Send the invoice
✅ They tap to pay
✅ Money hits instantly
No waiting on homeowners to "find their checkbook." No awkward "can you Venmo me?" conversations.
Just clean, fast pay for clean, fast work. 💪🏽
You do the hustle. We get you paid.
#painterlife #housepainter #paintingcontractor #homeimprovement #tradelife #bluecollarboss #smallbusinessowner #tx2pay #getpaidfast #entrepreneurlife #sidehustleszn #skilledtrades

AFTER the full post, add one final line in this exact format:
IMAGE_PROMPT: [cinematic photorealistic description of the service professional at work — subject + action + environment + mood/lighting + "no text, no logos"]`;

const WORD_POST_SYSTEM = `You are a social media content writer for TX2Pay, a payment and invoicing platform for small service businesses. You write Facebook link posts that drive traffic to specific TX2Pay feature pages.

RULES:
- Always write "TX2Pay" with exact capitalization
- Heavy emojis throughout
- 4–6 sentences building on the angle before the URL
- End with the specific URL on its own line, then hashtags on the next line

ANGLE TYPES:
- pain_point: Start with a relatable frustration small business owners face
- aspirational: Paint a vision of the business success/freedom they want
- feature: Lead with a specific TX2Pay capability and its concrete value

EXAMPLE — pain_point (scheduling):
Be honest — how are you currently scheduling jobs? 📱
Group text? A whiteboard? A spreadsheet you update manually every morning? Calls back and forth with customers trying to find a time that works?
For most small service businesses, scheduling is one of those things that works fine until it really doesn't. A double-booking, a no-show, a job that falls through the cracks — and suddenly you're putting out fires instead of running your business.
TX2Pay's free scheduling tool keeps your jobs organized, your team on the same page, and your customers automatically reminded — so you stop losing time to admin and start fitting more jobs in your day.
https://tx2pay.com/scheduling
#SmallBusiness #Scheduling #FieldService #Contractor #Trades

EXAMPLE — aspirational (startup):
Here's something nobody tells you when you start a business: 💡
How you handle your money from day one sets the tone for everything that comes after.
Clients who get a professional, branded invoice the moment a job is done pay faster. 💸 They take you more seriously. They refer you more. And YOU feel more like a real business — because you are one.
TX2Pay gives startups the same professional invoicing and payment tools that established businesses use — completely free, so you can put your money into growing instead of software subscriptions.
Start like you mean it. 🔥
https://tx2pay.com/startup
#Startup #Entrepreneur #StartupTips #SmallBusiness #GetPaidFaster #NewBusiness`;

// ─── Generators ───────────────────────────────────────────────────────────────

export async function generateHustlePost(
  business: string
): Promise<{ content: string; image_prompt: string }> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: HUSTLE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write the hustle campaign post for a ${business}. Follow the exact structure from the examples. Include the IMAGE_PROMPT line at the end.`,
      },
    ],
  });

  const full = msg.content[0].type === "text" ? msg.content[0].text : "";
  const imgMatch = full.match(/\nIMAGE_PROMPT:\s*([\s\S]+)$/);
  const image_prompt = imgMatch ? imgMatch[1].trim() : "";
  const content = full.replace(/\nIMAGE_PROMPT:[\s\S]+$/, "").trim();
  return { content, image_prompt };
}

export async function generateWordPost(
  url: string,
  label: string,
  angle: WordPostAngle
): Promise<{ content: string }> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: WORD_POST_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write a ${angle.replace("_", " ")} angle post for the TX2Pay "${label}" page. End the post with this URL on its own line: ${url}`,
      },
    ],
  });

  const content = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  return { content };
}
