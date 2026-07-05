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
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  let imagePrompt = meta?.image_prompt as string | undefined;
  const bannerCaption = (meta?.banner_caption as string | undefined) ?? "You Do The Hustle, We Get You Paid";

  // If no stored image_prompt, generate one from the post content via Claude
  if (!imagePrompt) {
    try {
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Based on this Facebook post, write a cinematic photorealistic image prompt for a Leonardo AI image. Describe the specific service professional at work — their trade, action, environment, lighting. No text, no logos. One paragraph max.\n\nPost:\n${post.content.slice(0, 800)}`,
        }],
      });
      imagePrompt = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : undefined;
    } catch {
      return NextResponse.json({ error: "Could not generate an image prompt for this post" }, { status: 500 });
    }
    if (!imagePrompt) {
      return NextResponse.json({ error: "This post has no image prompt" }, { status: 400 });
    }
  }

  try {
    // 1. Generate base image with Leonardo AI
    const leonardoUrl = await generateImage(imagePrompt);

    // 2. Composite the TX2Pay branding strip onto the image
    const brandedBuffer = await composeBrandedImage(leonardoUrl, bannerCaption);

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
