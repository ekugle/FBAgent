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

interface VideoGenerationResponse {
  motionVideoGenerationJob: {
    generationId: string;
  };
}

export type VideoQuality = "MOTION2FAST" | "MOTION2";

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

interface GenerationStatusWithVideoResponse {
  generations_by_pk: {
    status: "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";
    generated_images: Array<{ url: string; id: string; motionMp4URL?: string }>;
    generated_videos?: Array<{ url?: string; motionMp4URL?: string }>;
    motionMp4URL?: string;
  };
}

// ---------------------------------------------------------------------------
// Non-polling helpers — start a job and return the generationId immediately
// ---------------------------------------------------------------------------

/**
 * Start image generation without polling. Returns the generationId.
 */
export async function startImageGeneration(prompt: string): Promise<string> {
  const genRes = await fetch(`${LEONARDO_BASE}/generations`, {
    method: "POST",
    headers: leonardoHeaders(),
    body: JSON.stringify({
      prompt,
      modelId: DEFAULT_MODEL_ID,
      num_images: 1,
      width: 1024,
      height: 576,
      ultra: false,
    }),
  });
  if (!genRes.ok) {
    const text = await genRes.text();
    throw new Error(`Leonardo generation failed (${genRes.status}): ${text}`);
  }
  const genData = (await genRes.json()) as GenerationResponse;
  const generationId = genData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo API returned no generationId");
  return generationId;
}

/**
 * Poll image generation status once. Returns status + imageId/url when COMPLETE.
 */
export async function checkImageGeneration(generationId: string): Promise<{
  status: "pending" | "complete" | "failed";
  imageId?: string;
  imageUrl?: string;
}> {
  const statusRes = await fetch(`${LEONARDO_BASE}/generations/${generationId}`, {
    headers: leonardoHeaders(),
  });
  if (!statusRes.ok) return { status: "pending" };
  const statusData = (await statusRes.json()) as GenerationStatusResponse;
  const gen = statusData.generations_by_pk;
  if (gen?.status === "COMPLETE") {
    const img = gen.generated_images?.[0];
    if (!img) throw new Error("Leonardo generation complete but no image");
    return { status: "complete", imageId: img.id, imageUrl: img.url };
  }
  if (gen?.status === "FAILED") return { status: "failed" };
  return { status: "pending" };
}

/**
 * Start video (Image-to-Video) generation without polling. Returns the generationId.
 */
export async function startVideoGeneration(
  imageId: string,
  prompt: string,
  model: VideoQuality = "MOTION2FAST"
): Promise<string> {
  const motionRes = await fetch(`${LEONARDO_BASE}/generations-image-to-video`, {
    method: "POST",
    headers: leonardoHeaders(),
    body: JSON.stringify({
      imageId,
      imageType: "GENERATED",
      prompt,
      model,
      resolution: "RESOLUTION_720",
      isPublic: false,
    }),
  });
  if (!motionRes.ok) {
    const text = await motionRes.text();
    throw new Error(`Leonardo Image-to-Video failed (${motionRes.status}): ${text}`);
  }
  const motionData = (await motionRes.json()) as VideoGenerationResponse;
  const generationId = motionData.motionVideoGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo Video API returned no generationId");
  return generationId;
}

/**
 * After a video generation job completes, Leonardo writes the final MP4 URL
 * back onto the SOURCE IMAGE generation record (not the video job record).
 * Returns the URL if found, plus the raw response for debugging.
 */
export async function getMotionVideoUrl(imageGenId: string): Promise<{
  url?: string;
  raw?: unknown;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${LEONARDO_BASE}/generations/${imageGenId}`, { headers: leonardoHeaders() });
  if (!res.ok) return {};
  const data = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const gen = data?.generations_by_pk;
  const img = gen?.generated_images?.[0];

  // Try all possible locations for the MP4 URL
  const url: string | undefined =
    img?.motionMp4URL ||
    img?.motionMP4URL ||
    gen?.motionMp4URL ||
    gen?.generated_video?.url ||
    gen?.generated_video?.motionMp4URL ||
    gen?.generated_videos?.[0]?.motionMp4URL ||
    gen?.generated_videos?.[0]?.url;

  console.log(`getMotionVideoUrl(${imageGenId}): status=${gen?.status} url=${url ?? "null"}`);
  if (!url) {
    console.log("image gen keys:", Object.keys(gen ?? {}));
    console.log("img keys:", Object.keys(img ?? {}));
  }

  return { url, raw: data };
}

/**
 * Poll video generation status once. Returns status + videoUrl when COMPLETE.
 * Tries every known Leonardo response shape (SVD, MOTION2, MOTION2FAST).
 */
export async function checkVideoGeneration(generationId: string): Promise<{
  status: "pending" | "complete" | "failed";
  videoUrl?: string;
  rawResponse?: unknown;
}> {
  // ── 1. Try the dedicated Image-to-Video status endpoint first ──────────────
  // MOTION2/MOTION2FAST jobs may have their final URL here, not in /generations/{id}
  const itovRes = await fetch(`${LEONARDO_BASE}/generations-image-to-video/${generationId}`, {
    headers: leonardoHeaders(),
  });
  if (itovRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itovData = (await itovRes.json()) as any;
    const itovGen = itovData?.generation_by_pk ?? itovData?.generations_by_pk ?? itovData;
    console.log(`checkVideoGeneration I2V(${generationId}): status=${itovGen?.status} keys=${Object.keys(itovGen ?? {}).join(",")}`);
    if (itovGen?.status === "COMPLETE") {
      const videoUrl: string | undefined =
        itovGen.mp4URL ||
        itovGen.motionMp4URL ||
        itovGen.motionMP4URL ||
        itovGen.url ||
        itovGen.generated_video?.url ||
        itovGen.generated_video?.motionMp4URL ||
        itovGen.generated_videos?.[0]?.url ||
        itovGen.generated_videos?.[0]?.motionMp4URL;
      if (videoUrl) return { status: "complete", videoUrl };
      // COMPLETE but URL not in expected fields — log everything for diagnostics
      console.error("I2V COMPLETE but no URL found. Full response:\n", JSON.stringify(itovData, null, 2));
    }
    if (itovGen?.status === "FAILED") return { status: "failed" };
  }

  // ── 2. Fall back to the generic /generations/{id} endpoint ────────────────
  const statusRes = await fetch(`${LEONARDO_BASE}/generations/${generationId}`, {
    headers: leonardoHeaders(),
  });
  if (!statusRes.ok) return { status: "pending" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusData = (await statusRes.json()) as any;
  const gen = statusData?.generations_by_pk;

  if (gen?.status === "COMPLETE") {
    // Try every known field name across all Leonardo model types
    const motionUrl: string | undefined =
      gen.generated_images?.[0]?.motionMp4URL ||    // SVD / older models
      gen.generated_videos?.[0]?.motionMp4URL ||    // generated_videos array
      gen.generated_videos?.[0]?.url ||
      gen.generated_video?.motionMp4URL ||           // generated_video singular
      gen.generated_video?.url ||
      gen.generated_video?.motionMP4URL ||
      gen.motionMp4URL ||
      gen.url;

    // MOTION2FAST may expose the video URL as generated_images[0].url (mp4, not jpg)
    const imgUrl: string | undefined = gen.generated_images?.[0]?.url;
    const imgVideoUrl = imgUrl && (imgUrl.includes(".mp4") || imgUrl.includes("video"))
      ? imgUrl
      : undefined;

    const videoUrl = motionUrl || imgVideoUrl;
    if (videoUrl) return { status: "complete", videoUrl };

    // Nothing found — bubble the raw response back so the caller can log it client-side
    console.error(
      "Leonardo Video COMPLETE but no URL found. Raw:\n",
      JSON.stringify(statusData, null, 2)
    );
    return { status: "complete", rawResponse: statusData };
  }
  if (gen?.status === "FAILED") return { status: "failed" };
  return { status: "pending" };
}

// ---------------------------------------------------------------------------
// Legacy blocking helpers (kept for image-only posts)
// ---------------------------------------------------------------------------

/**
 * Animate a previously generated image into a short video using
 * Leonardo Image-to-Video (MOTION2FAST by default for cost efficiency).
 *
 * @param imageId  - The Leonardo image ID from a prior generateImageWithId call
 * @param prompt   - Same prompt used for the source image (required by API)
 * @param model    - "MOTION2FAST" (lower cost) or "MOTION2" (best quality)
 * @returns Public URL of the generated MP4 video
 */
export async function generateVideoFromImage(
  imageId: string,
  prompt: string,
  model: VideoQuality = "MOTION2FAST"
): Promise<string> {
  const motionRes = await fetch(`${LEONARDO_BASE}/generations-image-to-video`, {
    method: "POST",
    headers: leonardoHeaders(),
    body: JSON.stringify({
      imageId,
      imageType: "GENERATED",
      prompt,
      model,
      resolution: "RESOLUTION_720",
      isPublic: false,
    }),
  });

  if (!motionRes.ok) {
    const text = await motionRes.text();
    throw new Error(`Leonardo Image-to-Video failed (${motionRes.status}): ${text}`);
  }

  const motionData = (await motionRes.json()) as VideoGenerationResponse;
  const generationId = motionData.motionVideoGenerationJob?.generationId;
  if (!generationId) {
    throw new Error("Leonardo Video API returned no generationId");
  }

  // Poll until the video is ready (up to 5 minutes)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `${LEONARDO_BASE}/generations/${generationId}`,
      { headers: leonardoHeaders() }
    );
    if (!statusRes.ok) continue;

    const statusData = (await statusRes.json()) as GenerationStatusWithVideoResponse;
    const gen = statusData.generations_by_pk;

    if (gen?.status === "COMPLETE") {
      const videoUrl =
        gen.generated_images?.[0]?.motionMp4URL ||
        gen.generated_videos?.[0]?.motionMp4URL ||
        gen.generated_videos?.[0]?.url ||
        gen.motionMp4URL;
      if (!videoUrl) {
        console.error("Leonardo Video COMPLETE but no URL found. Response:", JSON.stringify(statusData, null, 2));
        throw new Error("Leonardo Video complete but no MP4 URL");
      }
      return videoUrl;
    }
    if (gen?.status === "FAILED") {
      throw new Error("Leonardo Video generation failed");
    }
  }

  throw new Error("Leonardo Video generation timed out after 5 minutes");
}

