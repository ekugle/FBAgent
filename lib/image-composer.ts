import sharp from "sharp";
import path from "path";
import fs from "fs";

const STRIP_HEIGHT = 130;
const BRAND_NAVY = "#172554";
const LOGO_AREA_WIDTH = 220;
const SEPARATOR_X = LOGO_AREA_WIDTH + 20;
const TEXT_X = SEPARATOR_X + 30;
const FONT_SIZE = 36;
const LINE_HEIGHT = FONT_SIZE * 1.25;
// Approx chars per line at FONT_SIZE px Inter Bold in the available text width
const CHARS_PER_LINE = 30;

const FONT_PATH = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
const LOGO_PATH = path.join(process.cwd(), "public", "tx2pay-logo-white.png");

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Split text into lines of at most maxChars, breaking on word boundaries. */
function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function composeBrandedImage(
  leonardoUrl: string,
  slogan = "Get Paid Faster"
): Promise<Buffer> {
  const imgRes = await fetch(leonardoUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image (${imgRes.status})`);
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // Embed font as base64 — works on Vercel Lambda (no system fonts needed)
  const fontB64 = fs.existsSync(FONT_PATH)
    ? fs.readFileSync(FONT_PATH).toString("base64")
    : null;
  const fontFace = fontB64
    ? `@font-face{font-family:'Inter';src:url('data:font/truetype;base64,${fontB64}');font-weight:bold;}`
    : "";
  const fontFamily = fontB64 ? "Inter,sans-serif" : "sans-serif";

  // Word-wrap slogan and compute vertical centering
  const lines = wordWrap(slogan, CHARS_PER_LINE);
  const totalTextH = lines.length * LINE_HEIGHT;
  const textY = (STRIP_HEIGHT - totalTextH) / 2 + FONT_SIZE; // baseline of first line

  const tspans = lines
    .map((line, i) =>
      `<tspan x="${TEXT_X}" dy="${i === 0 ? 0 : LINE_HEIGHT}">${escapeXml(line)}</tspan>`
    )
    .join("");

  const stripSvg = `<svg width="${width}" height="${STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace}</style></defs>
    <rect width="${width}" height="${STRIP_HEIGHT}" fill="${BRAND_NAVY}"/>
    <line x1="${SEPARATOR_X}" y1="14" x2="${SEPARATOR_X}" y2="${STRIP_HEIGHT - 14}"
      stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
    <text y="${textY}" font-family="${fontFamily}" font-weight="bold"
      font-size="${FONT_SIZE}" fill="white">${tspans}</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(stripSvg), top: height - STRIP_HEIGHT, left: 0 },
  ];

  // Logo PNG centered vertically in the left area
  if (fs.existsSync(LOGO_PATH)) {
    const logoBuffer = await sharp(LOGO_PATH)
      .resize({ height: STRIP_HEIGHT - 16, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    const logoH = (await sharp(logoBuffer).metadata()).height ?? 0;
    composites.push({
      input: logoBuffer,
      top: height - STRIP_HEIGHT + Math.round((STRIP_HEIGHT - logoH) / 2),
      left: 20,
    });
  }

  return sharp(imageBuffer).composite(composites).jpeg({ quality: 92 }).toBuffer();
}
