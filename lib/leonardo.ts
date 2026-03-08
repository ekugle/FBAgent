/**
 * Leonardo AI client for generating images from text prompts.
 *
 * API key: https://app.leonardo.ai → User Settings → API Access
 * Model IDs: https://docs.leonardo.ai/docs/models
 */

const LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest/v1";

// Leonardo Lucid Origin — higher quality, cinematic, full HD, cost-efficient
const DEFAULT_MODEL_ID = "7b592283-e8a7-4c5a-9ba6-d18c31f258b9";

function leonardoHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.LEONARDO_API_KEY!}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface GenerationResponse {
  sdGenerationJob: {
    generationId: string;
  };
}

interface GenerationStatusResponse {
  generations_by_pk: {
    status: "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";
    generated_images: Array<{ url: string; id: string }>;
    generated_videos?: Array<{ url: string }>;
  };
}

interface MotionGenerationResponse {
  motionSvdGenerationJob: {
    generationId: string;
  };
}

/**
 * Generate an image from a text prompt. Returns the URL and the Leonardo
 * image ID (needed to animate the image into a video).
 */
export async function generateImageWithId(
  prompt: string
): Promise<{ url: string; imageId: string }> {
  const genRes = await fetch(`${LEONARDO_BASE}/generations`, {
    method: "POST",
    headers: leonardoHeaders(),
    body: JSON.stringify({
      prompt,
      modelId: DEFAULT_MODEL_ID,
      num_images: 1,
      width: 1024,
      height: 576, // 16:9 landscape — better for Reels/video
      ultra: false,
    }),
  });

  if (!genRes.ok) {
    const text = await genRes.text();
    throw new Error(`Leonardo generation failed (${genRes.status}): ${text}`);
  }

  const genData = (await genRes.json()) as GenerationResponse;
  const generationId = genData.sdGenerationJob?.generationId;
  if (!generationId) {
    throw new Error("Leonardo API returned no generationId");
  }

  // Poll until complete (up to 3 minutes)
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `${LEONARDO_BASE}/generations/${generationId}`,
      { headers: leonardoHeaders() }
    );
    if (!statusRes.ok) continue;

    const statusData = (await statusRes.json()) as GenerationStatusResponse;
    const gen = statusData.generations_by_pk;

    if (gen?.status === "COMPLETE") {
      const img = gen.generated_images?.[0];
      if (!img) throw new Error("Leonardo generation complete but no image");
      return { url: img.url, imageId: img.id };
    }
    if (gen?.status === "FAILED") {
      throw new Error("Leonardo image generation failed");
    }
  }

  throw new Error("Leonardo image generation timed out after 3 minutes");
}

/**
 * Generate an image from a text prompt using Leonardo AI.
 * Polls until complete and returns the image URL.
 */
export async function generateImage(prompt: string): Promise<string> {
  const { url } = await generateImageWithId(prompt);
  return url;
}

/**
 * Animate a previously generated image into a short video using
 * Leonardo Motion SVD (Stable Video Diffusion).
 *
 * @param imageId  - The Leonardo image ID from a prior generateImageWithId call
 * @param motionStrength - 1–10, how much motion (default 5)
 * @returns Public URL of the generated MP4 video (~4 seconds)
 */
export async function generateVideoFromImage(
  imageId: string,
  motionStrength = 5
): Promise<string> {
  const motionRes = await fetch(`${LEONARDO_BASE}/generations-motion-svd`, {
    method: "POST",
    headers: leonardoHeaders(),
    body: JSON.stringify({
      imageId,
      motionStrength,
      isPublic: false,
    }),
  });

  if (!motionRes.ok) {
    const text = await motionRes.text();
    throw new Error(`Leonardo Motion SVD failed (${motionRes.status}): ${text}`);
  }

  const motionData = (await motionRes.json()) as MotionGenerationResponse;
  const generationId = motionData.motionSvdGenerationJob?.generationId;
  if (!generationId) {
    throw new Error("Leonardo Motion API returned no generationId");
  }

  // Poll until the video is ready (videos take longer — up to 5 minutes)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `${LEONARDO_BASE}/generations/${generationId}`,
      { headers: leonardoHeaders() }
    );
    if (!statusRes.ok) continue;

    const statusData = (await statusRes.json()) as GenerationStatusResponse;
    const gen = statusData.generations_by_pk;

    if (gen?.status === "COMPLETE") {
      const videoUrl = gen.generated_videos?.[0]?.url;
      if (!videoUrl) throw new Error("Leonardo Motion complete but no video URL");
      return videoUrl;
    }
    if (gen?.status === "FAILED") {
      throw new Error("Leonardo Motion generation failed");
    }
  }

  throw new Error("Leonardo Motion generation timed out after 5 minutes");
}

