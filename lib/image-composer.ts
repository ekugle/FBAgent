/**
 * Composes a branded TX2Pay strip onto a Leonardo-generated image.
 *
 * Bottom strip layout:
 *   [TX2Pay logo] | [Slogan — large, bold, eye-catching]
 *
 * Text is rendered via Sharp's native Pango engine (not SVG) with a bundled
 * Inter font to guarantee legibility on Vercel serverless (no system fonts).
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

const STRIP_HEIGHT = 130; // px — taller bar for bigger text
const BRAND_NAVY = "#172554"; // TX2Pay dark navy
const LOGO_AREA_WIDTH = 220; // px — space reserved for the logo on the left
const SEPARATOR_X = LOGO_AREA_WIDTH + 20;
const TEXT_X = SEPARATOR_X + 30;
const FONT_SIZE = 44; // large, attention-grabbing

const FONT_PATH = path.join(process.cwd(), "public", "fonts", "Inter.ttf");

/**
 * Downloads a Leonardo image, composites a branded bottom strip, and returns
 * the result as a JPEG buffer.
 */
export async function composeBrandedImage(
  leonardoUrl: string,
  slogan = "Get Paid Faster"
): Promise<Buffer> {
  const imgRes = await fetch(leonardoUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download Leonardo image (${imgRes.status})`);
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const hasFont = fs.existsSync(FONT_PATH);
  const logoPath = path.join(process.cwd(), "public", "tx2pay-logo-white.png");
  const hasLogo = fs.existsSync(logoPath);

  const composites: sharp.OverlayOptions[] = [];

  // 1. Navy background strip
  const stripSvg = `<svg width="${width}" height="${STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${STRIP_HEIGHT}" fill="${BRAND_NAVY}"/>
    <line x1="${SEPARATOR_X}" y1="16" x2="${SEPARATOR_X}" y2="${STRIP_HEIGHT - 16}"
      stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  </svg>`;
  composites.push({
    input: Buffer.from(stripSvg),
    top: height - STRIP_HEIGHT,
    left: 0,
  });

  // 2. Logo PNG — larger, centered vertically in the strip
  if (hasLogo) {
    const logoBuffer = await sharp(logoPath)
      .resize({ height: STRIP_HEIGHT - 20, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoTop = height - STRIP_HEIGHT + Math.round((STRIP_HEIGHT - (logoMeta.height ?? 0)) / 2);
    composites.push({
      input: logoBuffer,
      top: logoTop,
      left: 24,
    });
  } else {
    // Fallback: render "TX2Pay" as Pango text if no logo file
    if (hasFont) {
      const fallbackText = await sharp({
        text: {
          text: `<span foreground="white" font_desc="Inter Bold 40">TX2Pay</span>`,
          fontfile: FONT_PATH,
          width: LOGO_AREA_WIDTH - 20,
          height: STRIP_HEIGHT - 20,
          rgba: true,
        },
      })
        .png()
        .toBuffer();
      composites.push({
        input: fallbackText,
        top: height - STRIP_HEIGHT + 10,
        left: 24,
      });
    }
  }

  // 3. Slogan text — rendered by Pango with bundled font
  const textWidth = width - TEXT_X - 24;
  const textBuffer = await sharp({
    text: {
      text: hasFont
        ? `<span foreground="white" font_desc="Inter Bold ${FONT_SIZE}">${escapeMarkup(slogan)}</span>`
        : `<span foreground="white" font_desc="Sans Bold ${FONT_SIZE}">${escapeMarkup(slogan)}</span>`,
      fontfile: hasFont ? FONT_PATH : undefined,
      width: textWidth,
      height: STRIP_HEIGHT - 20,
      rgba: true,
      align: "left",
    },
  })
    .png()
    .toBuffer();

  const textMeta = await sharp(textBuffer).metadata();
  const textTop =
    height - STRIP_HEIGHT + Math.round((STRIP_HEIGHT - (textMeta.height ?? 0)) / 2);

  composites.push({
    input: textBuffer,
    top: Math.max(textTop, height - STRIP_HEIGHT + 8),
    left: TEXT_X,
  });

  return sharp(imageBuffer)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Escape Pango markup special characters. */
function escapeMarkup(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
