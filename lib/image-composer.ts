/**
 * Composes a branded TX2Pay strip onto a Leonardo-generated image.
 *
 * Bottom strip layout:
 *   [TX2Pay logo] | [Slogan — large, bold, eye-catching]
 *
 * Text is rendered via Sharp's Pango engine using a bundled static Inter Bold
 * TTF font — no system fonts required (works on Vercel serverless).
 * Plain text (no Pango markup) + fontfile ensures font loads even without
 * fontconfig registration. Text is rendered black-on-transparent then negated
 * to white-on-transparent before compositing.
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

const STRIP_HEIGHT = 130;
const BRAND_NAVY = "#172554";
const LOGO_AREA_WIDTH = 220;
const SEPARATOR_X = LOGO_AREA_WIDTH + 20;
const TEXT_X = SEPARATOR_X + 30;
const TEXT_DPI = 300; // drives font size — higher = bigger text

const FONT_PATH = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
const LOGO_PATH = path.join(process.cwd(), "public", "tx2pay-logo-white.png");

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
  const hasLogo = fs.existsSync(LOGO_PATH);

  const composites: sharp.OverlayOptions[] = [];

  // 1. Navy strip background + separator line (SVG — no text, just shapes)
  const stripSvg = `<svg width="${width}" height="${STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${STRIP_HEIGHT}" fill="${BRAND_NAVY}"/>
    <line x1="${SEPARATOR_X}" y1="14" x2="${SEPARATOR_X}" y2="${STRIP_HEIGHT - 14}"
      stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  </svg>`;
  composites.push({
    input: Buffer.from(stripSvg),
    top: height - STRIP_HEIGHT,
    left: 0,
  });

  // 2. Logo PNG — larger, vertically centered in the strip
  if (hasLogo) {
    const logoBuffer = await sharp(LOGO_PATH)
      .resize({ height: STRIP_HEIGHT - 16, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoH = logoMeta.height ?? 0;
    composites.push({
      input: logoBuffer,
      top: height - STRIP_HEIGHT + Math.round((STRIP_HEIGHT - logoH) / 2),
      left: 20,
    });
  }

  // 3. Slogan — rendered by Pango with bundled font, negated to white
  const textWidth = width - TEXT_X - 20;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBuffer = await (sharp({ text: {
    text: slogan,
    ...(hasFont ? { font: "Inter Bold", fontfile: FONT_PATH } : { font: "Sans Bold" }),
    width: textWidth,
    rgba: true,
    dpi: TEXT_DPI,
  } } as any) as sharp.Sharp)
    .negate({ alpha: false }) // black text on transparent → white text on transparent
    .png()
    .toBuffer();

  const textMeta = await sharp(textBuffer).metadata();
  const textH = textMeta.height ?? 0;
  const textTop = height - STRIP_HEIGHT + Math.round((STRIP_HEIGHT - textH) / 2);

  composites.push({
    input: textBuffer,
    top: Math.max(textTop, height - STRIP_HEIGHT + 6),
    left: TEXT_X,
  });

  return sharp(imageBuffer)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}
