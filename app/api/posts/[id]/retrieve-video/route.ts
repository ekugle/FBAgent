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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClient();

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const pastedUrl = body?.leonardo_url as string | undefined;

  const { data: post, error: fetchError } = await db
    .from("posts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const meta = (post.metadata ?? {}) as Record<string, unknown>;

  try {
    let motionUrl: string | undefined;

    if (pastedUrl && (pastedUrl.startsWith("http://") || pastedUrl.startsWith("https://"))) {
      // User pasted a direct CDN URL — use it immediately
      motionUrl = pastedUrl;
    } else {
      // No URL pasted — look it up from Leonardo using the stored image gen ID
      const imageGenId = meta.video_image_gen_id as string | undefined;
      if (!imageGenId) {
        return NextResponse.json(
          { error: "No image generation ID stored for this post. Please generate the video first." },
          { status: 400 }
        );
      }
      const { url } = await getMotionVideoUrl(imageGenId);
      motionUrl = url;
    }

    if (!motionUrl) {
      return NextResponse.json(
        { error: "Video not yet available on Leonardo — it may still be processing. Try again in a moment." },
        { status: 202 }
      );
    }

    // Save the URL immediately so it's never lost
    await db
      .from("posts")
      .update({
        image_urls: [motionUrl],
        metadata: { ...meta, video_gen_phase: "complete" },
      })
      .eq("id", id);

    // Best-effort upload to Supabase Storage for a permanent URL
    let finalUrl = motionUrl;
    try {
      const videoRes = await fetch(motionUrl);
      if (videoRes.ok) {
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const filename = `posts/${id}-${Date.now()}.mp4`;
        const storageUrl = await uploadVideoToStorage(videoBuffer, filename);
        await db.from("posts").update({ image_urls: [storageUrl] }).eq("id", id);
        finalUrl = storageUrl;
      }
    } catch (uploadErr) {
      console.error("[retrieve-video] Supabase upload failed, keeping Leonardo URL:", uploadErr);
    }

    return NextResponse.json({ video_url: finalUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
