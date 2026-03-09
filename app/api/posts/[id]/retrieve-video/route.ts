/**
 * POST /api/posts/[id]/retrieve-video
 *
 * Accepts a Leonardo generation URL or raw generation ID, fetches the
 * completed video from Leonardo, uploads it to Supabase Storage, and
 * saves the permanent URL back to the post.
 *
 * Body: { generation_id: string }  OR  { leonardo_url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, uploadVideoToStorage } from "@/lib/supabase";
import { checkVideoGeneration } from "@/lib/leonardo";

/** Extract UUID from a Leonardo app URL or return the raw string if already a UUID */
function extractGenerationId(input: string): string {
  // Match the last UUID-shaped segment in the string
  const match = input.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : input.trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const rawInput = body.generation_id || body.leonardo_url || "";
  if (!rawInput) {
    return NextResponse.json({ error: "generation_id or leonardo_url is required" }, { status: 400 });
  }

  const generationId = extractGenerationId(rawInput);

  const { data: post, error: fetchError } = await db
    .from("posts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  try {
    const result = await checkVideoGeneration(generationId);

    if (result.status === "pending") {
      return NextResponse.json({ error: "Video is still generating — try again in a moment" }, { status: 202 });
    }
    if (result.status === "failed") {
      return NextResponse.json({ error: "Video generation failed on Leonardo" }, { status: 500 });
    }

    if (!result.videoUrl) {
      // Return the raw response so the client can log it
      console.error("retrieve-video: COMPLETE but no URL. Raw:", JSON.stringify(result.rawResponse, null, 2));
      return NextResponse.json(
        { error: "Video complete on Leonardo but URL not found in response", rawResponse: result.rawResponse },
        { status: 500 }
      );
    }

    // Download from Leonardo and upload to Supabase for a permanent URL
    const videoRes = await fetch(result.videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video from Leonardo (${videoRes.status})`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `posts/${id}-${Date.now()}.mp4`;
    const storageUrl = await uploadVideoToStorage(videoBuffer, filename);

    // Save permanent URL to the post
    const meta = (post.metadata ?? {}) as Record<string, unknown>;
    await db
      .from("posts")
      .update({
        image_urls: [storageUrl],
        metadata: { ...meta, video_gen_phase: "complete" },
      })
      .eq("id", id);

    return NextResponse.json({ video_url: storageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
