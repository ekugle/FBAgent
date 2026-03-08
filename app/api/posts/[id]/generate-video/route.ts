/**
 * POST /api/posts/[id]/generate-video
 *
 * Reads video_prompt from post metadata, calls Leonardo AI to:
 *   1. Generate a base image (16:9) from the prompt
 *   2. Animate it into an MP4 via Image-to-Video (MOTION2FAST or MOTION2)
 * Then uploads the video to Supabase Storage and saves the URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, uploadVideoToStorage } from "@/lib/supabase";
import { generateImageWithId, generateVideoFromImage, VideoQuality } from "@/lib/leonardo";

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

  const meta = post.metadata as Record<string, unknown>;
  const videoPrompt = meta?.video_prompt as string | undefined;
  const videoQuality = ((meta?.video_quality as string | undefined) ?? "MOTION2FAST") as VideoQuality;

  if (!videoPrompt) {
    return NextResponse.json(
      { error: "This post has no video prompt" },
      { status: 400 }
    );
  }

  try {
    // 1. Generate a base image (16:9 landscape) from the prompt
    const { imageId } = await generateImageWithId(videoPrompt);

    // 2. Animate the image using Image-to-Video
    const leonardoVideoUrl = await generateVideoFromImage(imageId, videoPrompt, videoQuality);

    // 3. Download the video from Leonardo (temporary URL)
    const videoRes = await fetch(leonardoVideoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video from Leonardo (${videoRes.status})`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    // 4. Upload to Supabase Storage for a permanent URL
    const filename = `posts/${id}-${Date.now()}.mp4`;
    const videoUrl = await uploadVideoToStorage(videoBuffer, filename);

    // 5. Save the permanent URL back to the post
    const { error: updateError } = await db
      .from("posts")
      .update({ image_urls: [videoUrl] })
      .eq("id", id);

    if (updateError) throw updateError;

    return NextResponse.json({ video_url: videoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
