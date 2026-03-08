import sharp from "sharp";
import satori from "satori";
import path from "path";
import fs from "fs";

const STRIP_HEIGHT = 130;
const BRAND_NAVY = "#172554";
const LOGO_AREA_WIDTH = 220;
const SEPARATOR_X = LOGO_AREA_WIDTH + 20;
const TEXT_X = SEPARATOR_X + 30;

const FONT_FILE = path.join(
  process.cwd(),
  "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff"
);
const LOGO_PATH = path.join(process.cwd(), "public", "tx2pay-logo-white.png");

// Load font once at module level (cached on warm Lambda invocations)
let fontData: Buffer | null = null;
function getFont(): Buffer {
  if (!fontData) fontData = fs.readFileSync(FONT_FILE);
  return fontData;
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

  const textWidth = width - TEXT_X - 20;

  // Render text strip via satori — converts JSX-like objects to SVG with
  // embedded glyph paths. No system fonts needed; works on Vercel Lambda.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripSvg = await (satori as any)(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width,
          height: STRIP_HEIGHT,
          backgroundColor: BRAND_NAVY,
        },
        children: [
          // Left spacer (logo overlaid separately)
          { type: "div", props: { style: { width: SEPARATOR_X, flexShrink: 0 }, children: "" } },
          // Separator line
          {
            type: "div",
            props: {
              style: {
                width: 2,
                height: STRIP_HEIGHT - 28,
                backgroundColor: "rgba(255,255,255,0.35)",
                flexShrink: 0,
              },
              children: "",
            },
          },
          // Slogan text
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                width: textWidth,
                height: STRIP_HEIGHT,
                paddingLeft: 28,
              },
              children: {
                type: "span",
                props: {
                  style: {
                    fontFamily: "Inter",
                    fontWeight: "bold",
                    fontSize: 36,
                    color: "white",
                    lineHeight: 1.2,
                  },
                  children: slogan,
                },
              },
            },
          },
        ],
      },
    },
    {
      width,
      height: STRIP_HEIGHT,
      fonts: [{ name: "Inter", data: getFont(), weight: 700, style: "normal" }],
    }
  );

  const stripBuffer = await sharp(Buffer.from(stripSvg)).png().toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: stripBuffer, top: height - STRIP_HEIGHT, left: 0 },
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
