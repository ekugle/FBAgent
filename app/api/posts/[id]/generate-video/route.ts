/**
 * Async two-phase video generation for Reel posts.
 *
 * POST → kicks off image generation immediately and returns {status, generationId}.
 *        Saves the generationId in post.metadata so the pipeline survives timeouts.
 *
 * GET  → called by the frontend every ~5 s to advance the pipeline:
 *          phase "image"  → poll Leonardo; when complete, start video generation
 *          phase "video"  → poll Leonardo; when complete, download + upload to Supabase + save URL
 *        Returns {status: "generating_image"|"generating_video"|"complete"|"failed", video_url?}
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, uploadVideoToStorage } from "@/lib/supabase";
import {
  startImageGeneration,
  checkImageGeneration,
  startVideoGeneration,
  checkVideoGeneration,
  getMotionVideoUrl,
  VideoQuality,
} from "@/lib/leonardo";

// ── POST: start (or restart) generation ─────────────────────────────────────

export async function POST(
  req: NextRequest,
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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const restart = body?.restart === true;

  const meta = (post.metadata ?? {}) as Record<string, unknown>;
  const videoPrompt = meta?.video_prompt as string | undefined;
  const videoQuality = ((meta?.video_quality as string | undefined) ?? "MOTION2FAST") as VideoQuality;

  if (!videoPrompt) {
    return NextResponse.json({ error: "This post has no video prompt" }, { status: 400 });
  }

  // If already in progress, don't double-start — just report current phase
  if (!restart && meta.video_gen_phase === "image" && meta.video_image_gen_id) {
    return NextResponse.json({ status: "generating_image" });
  }
  if (!restart && meta.video_gen_phase === "video" && meta.video_video_gen_id) {
    return NextResponse.json({ status: "generating_video" });
  }
  if (!restart && meta.video_gen_phase === "complete") {
    const videoUrl = (post.image_urls as string[] | null)?.[0];
    return NextResponse.json({ status: "complete", video_url: videoUrl });
  }

  try {
    const imageGenId = await startImageGeneration(videoPrompt);

    const { error: updateError } = await db
      .from("posts")
      .update({
        metadata: {
          ...meta,
          video_gen_phase: "image",
          video_image_gen_id: imageGenId,
          video_quality_used: videoQuality,
        },
      })
      .eq("id", id);

    if (updateError) throw updateError;

    return NextResponse.json({ status: "generating_image" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET: advance pipeline one step ──────────────────────────────────────────

export async function GET(
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
  const phase = meta.video_gen_phase as string | undefined;
  const isReel = (meta?.post_type as string | undefined) === "reel";

  if (!phase || phase === "idle") {
    return NextResponse.json({ status: "idle" });
  }

  // If the video is already saved (image_urls has a URL), self-heal the phase and return complete
  const savedVideoUrl = (post.image_urls as string[] | null)?.[0];
  if (phase === "complete" || (savedVideoUrl && isReel)) {
    if (phase !== "complete" && savedVideoUrl) {
      // Fix the stuck phase in DB
      await db.from("posts").update({ metadata: { ...meta, video_gen_phase: "complete" } }).eq("id", id);
    }
    return NextResponse.json({ status: "complete", video_url: savedVideoUrl });
  }

  // ── Phase: waiting for image ──
  if (phase === "image") {
    const imageGenId = meta.video_image_gen_id as string;
    const videoQuality = ((meta.video_quality_used as string | undefined) ?? "MOTION2FAST") as VideoQuality;
    const videoPrompt = meta.video_prompt as string;

    try {
      const result = await checkImageGeneration(imageGenId);

      if (result.status === "complete") {
        // Image done → kick off video generation
        const videoGenId = await startVideoGeneration(result.imageId!, videoPrompt, videoQuality);

        await db
          .from("posts")
          .update({
            metadata: { ...meta, video_gen_phase: "video", video_video_gen_id: videoGenId },
          })
          .eq("id", id);

        return NextResponse.json({ status: "generating_video" });
      }

      if (result.status === "failed") {
        await db.from("posts").update({ metadata: { ...meta, video_gen_phase: null } }).eq("id", id);
        return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
      }

      return NextResponse.json({ status: "generating_image" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.from("posts").update({ metadata: { ...meta, video_gen_phase: null } }).eq("id", id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Phase: waiting for video ──
  if (phase === "video") {
    const videoGenId = meta.video_video_gen_id as string;
    const imageGenId = meta.video_image_gen_id as string;

    try {
      // For MOTION2FAST, Leonardo writes the final URL onto the SOURCE IMAGE generation
      // record, not on the video job. Check BOTH sources on every tick so we catch it
      // the moment it appears — regardless of what the video job status reports.
      const [jobResult, { url: imageGenUrl }] = await Promise.all([
        checkVideoGeneration(videoGenId),
        getMotionVideoUrl(imageGenId),
      ]);

      console.log(`[video poll] post=${id} jobStatus=${jobResult.status} jobUrl=${jobResult.videoUrl ?? "null"} imageGenUrl=${imageGenUrl ?? "null"}`);

      const motionUrl: string | undefined = jobResult.videoUrl ?? imageGenUrl ?? undefined;

      if (motionUrl) {
        // Download from Leonardo (temporary URL) and upload to Supabase for permanence
        const videoRes = await fetch(motionUrl);
        if (!videoRes.ok) {
          throw new Error(`Failed to download video from Leonardo (${videoRes.status})`);
        }
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const filename = `posts/${id}-${Date.now()}.mp4`;
        const storageUrl = await uploadVideoToStorage(videoBuffer, filename);

        const { error: saveError } = await db
          .from("posts")
          .update({
            image_urls: [storageUrl],
            metadata: { ...meta, video_gen_phase: "complete" },
          })
          .eq("id", id);
        if (saveError) {
          console.error("Failed to save video URL to post:", saveError);
        }

        return NextResponse.json({ status: "complete", video_url: storageUrl });
      }

      if (jobResult.status === "failed") {
        await db.from("posts").update({ metadata: { ...meta, video_gen_phase: null } }).eq("id", id);
        return NextResponse.json({ error: "Video generation failed" }, { status: 500 });
      }

      return NextResponse.json({ status: "generating_video" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.from("posts").update({ metadata: { ...meta, video_gen_phase: null } }).eq("id", id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ status: "unknown" });
}
