/**
 * POST /api/content/generate
 * Generate a single hustle or word post via Claude and save as a draft.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  generateHustlePost,
  generateWordPost,
} from "@/lib/content-generator";
import {
  WordPostAngle,
  WORD_POST_ANGLES,
} from "@/lib/post-schedule";
import { z } from "zod";

const Schema = z.discriminatedUnion("post_type", [
  z.object({
    post_type: z.literal("hustle"),
    business: z.string().min(1),
    scheduled_at: z.string().datetime().optional(),
  }),
  z.object({
    post_type: z.literal("word"),
    url: z.string().url(),
    url_label: z.string().min(1),
    angle: z.enum(WORD_POST_ANGLES),
    scheduled_at: z.string().datetime().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    let content: string;
    let image_prompt = "";
    let metadata: Record<string, unknown>;

    if (input.post_type === "hustle") {
      const result = await generateHustlePost(input.business);
      content = result.content;
      image_prompt = result.image_prompt;
      metadata = {
        post_type: "hustle",
        business: input.business,
        image_prompt,
      };
    } else {
      const result = await generateWordPost(
        input.url,
        input.url_label,
        input.angle as WordPostAngle
      );
      content = result.content;
      metadata = {
        post_type: "word",
        url: input.url,
        url_label: input.url_label,
        angle: input.angle,
      };
    }

    const db = createServerClient();
    const { data: post, error } = await db
      .from("posts")
      .insert({
        content,
        status: "pending_approval",
        scheduled_at: input.scheduled_at ?? null,
        created_by: "agent",
        agent_notes:
          input.post_type === "hustle"
            ? `AI-generated hustle campaign post for ${input.business}.`
            : `AI-generated word post (${input.angle}) linking to ${input.url_label}.`,
        metadata,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
