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

  if (!phase || phase === "idle") {
    return NextResponse.json({ status: "idle" });
  }

  if (phase === "complete") {
    const videoUrl = (post.image_urls as string[] | null)?.[0];
    return NextResponse.json({ status: "complete", video_url: videoUrl });
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

    try {
      const result = await checkVideoGeneration(videoGenId);

      if (result.status === "complete") {
        // No URL found — return raw response as error body so the client can log it
        if (!result.videoUrl) {
          const debugInfo = JSON.stringify(result.rawResponse, null, 2);
          console.error("No video URL in COMPLETE response. Raw:", debugInfo);
          await db.from("posts").update({ metadata: { ...meta, video_gen_phase: null } }).eq("id", id);
          return NextResponse.json(
            { error: "Leonardo Video complete but no MP4 URL — see rawResponse", rawResponse: result.rawResponse },
            { status: 500 }
          );
        }

        // Download from Leonardo (temporary URL) and upload to Supabase for permanence
        const videoRes = await fetch(result.videoUrl);
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
          // Still return the URL so the client can display it even if DB save failed
        }

        return NextResponse.json({ status: "complete", video_url: storageUrl });
      }

      if (result.status === "failed") {
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
