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

  // 1. Dark navy strip (SVG)
  const logoAreaWidth = hasLogo ? 300 : 210;
  const stripSvg = buildStripSvg(width, slogan, hasLogo, logoAreaWidth);
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
  logoAreaWidth: number
): string {
  const separatorX = logoAreaWidth + 20;
  const sloganX = separatorX + 28;
  const midY = STRIP_HEIGHT / 2;

  return `<svg width="${width}" height="${STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${STRIP_HEIGHT}" fill="${BRAND_NAVY}" fill-opacity="0.93"/>
  ${
    !hasLogo
      ? `<text
           x="28"
           y="${midY + 15}"
           font-family="Arial, Helvetica, sans-serif"
           font-size="42"
           font-weight="bold"
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
    font-family="Arial, Helvetica, sans-serif"
    font-size="24"
    font-style="italic"
    fill="rgba(255,255,255,0.88)">${escapeXml(slogan)}</text>
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
