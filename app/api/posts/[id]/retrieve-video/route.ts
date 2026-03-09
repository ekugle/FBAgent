/**
 * POST /api/posts/[id]/retrieve-video
 *
 * Retrieves a completed Leonardo video for this post by reading the stored
 * video_image_gen_id from post metadata and checking its motionMp4URL.
 * Uploads the video to Supabase Storage and saves the permanent URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, uploadVideoToStorage } from "@/lib/supabase";
import { getMotionVideoUrl } from "@/lib/leonardo";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();

  const { data: post, error: fetchError } = await db
    .from("posts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const meta = (post.metadata ?? {}) as Record<string, unknown>;
  const imageGenId = meta.video_image_gen_id as string | undefined;

  if (!imageGenId) {
    return NextResponse.json(
      { error: "No image generation ID stored for this post. Please generate the video first." },
      { status: 400 }
    );
  }

  try {
    // The MP4 URL is on the source image generation record
    const { url: motionUrl } = await getMotionVideoUrl(imageGenId);

    if (!motionUrl) {
      return NextResponse.json(
        { error: "Video not yet available on Leonardo — it may still be processing. Try again in a moment." },
        { status: 202 }
      );
    }

    // Download from Leonardo and upload to Supabase for a permanent URL
    const videoRes = await fetch(motionUrl as string);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video from Leonardo (${videoRes.status})`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `posts/${id}-${Date.now()}.mp4`;
    const storageUrl = await uploadVideoToStorage(videoBuffer, filename);

    // Save permanent URL to the post
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
