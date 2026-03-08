/**
 * Composes a branded TX2Pay strip onto a Leonardo-generated image.
 *
 * The bottom strip contains:
 *   - TX2Pay logo (white PNG) if present at public/tx2pay-logo-white.png
 *   - Vertical separator
 *   - Slogan text
 *
 * The composited image is returned as a JPEG Buffer ready to upload to storage.
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

const STRIP_HEIGHT = 110; // px — height of the bottom branding bar
const BRAND_NAVY = "#172554"; // TX2Pay dark navy

/**
 * Load bundled Inter font as base64 for embedding in SVG.
 * This avoids missing-font issues on serverless (Vercel/Lambda) where
 * Arial/Helvetica are not available.
 */
function getFontBase64(): string {
  const fontPath = path.join(process.cwd(), "public", "fonts", "Inter.ttf");
  if (!fs.existsSync(fontPath)) return "";
  return fs.readFileSync(fontPath).toString("base64");
}

/**
 * Downloads a Leonardo image, composites a branded bottom strip, and returns
 * the result as a JPEG buffer.
 *
 * @param leonardoUrl  - The image URL returned by Leonardo AI
 * @param slogan       - Short tagline displayed in the strip (default: "Get Paid Faster")
 */
export async function composeBrandedImage(
  leonardoUrl: string,
  slogan = "Get Paid Faster"
): Promise<Buffer> {
  // Download the source image
  const imgRes = await fetch(leonardoUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download Leonardo image (${imgRes.status})`);
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // Check for white logo asset
  const logoPath = path.join(process.cwd(), "public", "tx2pay-logo-white.png");
  const hasLogo = fs.existsSync(logoPath);

  // Composites to apply in order
  const composites: sharp.OverlayOptions[] = [];

  // 1. Dark navy strip (SVG with embedded font)
  const logoAreaWidth = hasLogo ? 300 : 210;
  const fontBase64 = getFontBase64();
  const stripSvg = buildStripSvg(width, slogan, hasLogo, logoAreaWidth, fontBase64);
  composites.push({
    input: Buffer.from(stripSvg),
    top: height - STRIP_HEIGHT,
    left: 0,
  });

  // 2. Logo PNG (if available) — scaled to fit strip height
  if (hasLogo) {
    const logoBuffer = await sharp(logoPath)
      .resize({ height: STRIP_HEIGHT - 24, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    composites.push({
      input: logoBuffer,
      top: height - STRIP_HEIGHT + 12,
      left: 28,
    });
  }

  return sharp(imageBuffer)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Builds the SVG rectangle + text overlay for the branding strip. */
function buildStripSvg(
  width: number,
  slogan: string,
  hasLogo: boolean,
  logoAreaWidth: number,
  fontBase64: string
): string {
  const separatorX = logoAreaWidth + 20;
  const sloganX = separatorX + 28;
  const midY = STRIP_HEIGHT / 2;

  const fontFace = fontBase64
    ? `<defs><style>@font-face{font-family:'Inter';src:url('data:font/truetype;base64,${fontBase64}');}</style></defs>`
    : "";
  const fontFamily = fontBase64
    ? "Inter, sans-serif"
    : "Liberation Sans, DejaVu Sans, sans-serif";

  return `<svg width="${width}" height="${STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${fontFace}
  <rect width="${width}" height="${STRIP_HEIGHT}" fill="${BRAND_NAVY}" fill-opacity="0.93"/>
  ${
    !hasLogo
      ? `<text
           x="28"
           y="${midY + 15}"
           font-family="${fontFamily}"
           font-size="42"
           font-weight="700"
           fill="white">TX2Pay</text>`
      : ""
  }
  <line
    x1="${separatorX}" y1="18"
    x2="${separatorX}" y2="${STRIP_HEIGHT - 18}"
    stroke="rgba(255,255,255,0.3)"
    stroke-width="1.5"/>
  <text
    x="${sloganX}"
    y="${midY + 9}"
    font-family="${fontFamily}"
    font-size="26"
    font-weight="600"
    fill="white">${escapeXml(slogan)}</text>
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
