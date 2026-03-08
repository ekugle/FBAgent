/**
 * POST /api/posts/[id]/generate-image
 *
 * Reads the image_prompt from post metadata, calls Leonardo AI to generate
 * an image, and saves the resulting URL to post.image_urls in Supabase.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, uploadImageToStorage } from "@/lib/supabase";
import { generateImage } from "@/lib/leonardo";
import { composeBrandedImage } from "@/lib/image-composer";

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

  const imagePrompt = (post.metadata as Record<string, unknown>)
    ?.image_prompt as string | undefined;

  if (!imagePrompt) {
    return NextResponse.json(
      { error: "This post has no image prompt" },
      { status: 400 }
    );
  }

  try {
    // 1. Generate base image with Leonardo AI
    const leonardoUrl = await generateImage(imagePrompt);

    // 2. Composite the TX2Pay branding strip onto the image
    const brandedBuffer = await composeBrandedImage(leonardoUrl, "You Do The Hustle, We Get You Paid");

    // 3. Upload branded image to Supabase Storage for a permanent URL
    const filename = `posts/${id}-${Date.now()}.jpg`;
    const imageUrl = await uploadImageToStorage(brandedBuffer, filename);

    // 4. Save the permanent URL back to the post
    const { error: updateError } = await db
      .from("posts")
      .update({ image_urls: [imageUrl] })
      .eq("id", id);

    if (updateError) throw updateError;

    return NextResponse.json({ image_url: imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
