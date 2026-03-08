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
  };
}

/**
 * Generate an image from a text prompt using Leonardo AI.
 * Polls until complete and returns the image URL.
 */
export async function generateImage(prompt: string): Promise<string> {
  // Start the generation
  const genRes = await fetch(`${LEONARDO_BASE}/generations`, {
    method: "POST",
    headers: leonardoHeaders(),
    body: JSON.stringify({
      prompt,
      modelId: DEFAULT_MODEL_ID,
      num_images: 1,
      width: 1024,
      height: 1024,
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
      const url = gen.generated_images?.[0]?.url;
      if (!url) throw new Error("Leonardo generation complete but no image URL");
      return url;
    }

    if (gen?.status === "FAILED") {
      throw new Error("Leonardo generation failed");
    }
  }

  throw new Error("Leonardo generation timed out after 3 minutes");
}
