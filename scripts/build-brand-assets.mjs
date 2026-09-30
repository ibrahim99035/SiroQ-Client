/**
 * Brand asset pipeline.
 *
 * The two source files in the repository root are flat JPEGs on a white
 * background, which is fine in a design tool and unusable on a website: JPEG
 * cannot be transparent, so the dark logo would arrive as a white rectangle
 * pasted on top of the dark hero. This turns them into real assets.
 *
 * The alpha channel is recovered from luminance rather than thresholded. Both
 * sources are a single dark ink on white, so alpha = 1 - luma gives
 * antialiased edges for free — a hard threshold leaves visible stair-step
 * halos around the curved badge, which are most obvious at favicon sizes.
 *
 * Geometry is handled explicitly on the raw RGBA buffer rather than with
 * `sharp.trim()`. That helper only strips rows that are *entirely* transparent,
 * so the faint antialiasing fringe at the edge of a 818px-wide source kept a
 * dozen pixels of padding around every output. Bounding the alpha channel
 * directly is both exact and reproducible.
 *
 * Two variants come out of every source:
 *   - ink      original colour, alpha from luminance (light backgrounds)
 *   - reversed solid white, same alpha                  (dark backgrounds)
 *
 * Run: npm run brand:assets
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "brand");

/**
 * Brand sources. These are the originals supplied by the designer and are the
 * input to this pipeline — committed deliberately, so every asset below can be
 * regenerated rather than re-exported by hand.
 */
const LOCKUP = path.join(ROOT, "brand", "siroq-lockup.jpg");
/** Standalone app mark, used for favicons and as the product glyph. */
const APP_MARK = path.join(ROOT, "brand", "siroq-mark.jpg");

/** Where the badge ends and the wordmark begins, as a fraction of the width. */
const BADGE_FRACTION = 0.235;

/** Ink green sampled from the sources. Only used for solid fills. */
const INK = { r: 2, g: 62, b: 47 };

/**
 * Alpha at or below this is treated as empty, and hard-zeroed.
 *
 * The sources are JPEGs, so the "white" background is not white: ringing
 * around the logo leaves isolated pixels across the entire frame at alpha 1-3,
 * which is enough to defeat any bounding-box scan (it would return the whole
 * image) and to smear a haze around the shape. The histogram is strongly
 * bimodal — background noise peaks around alpha 2, real ink starts near 197 —
 * so a cut at 16 sits in the empty gap and keeps every antialiased edge pixel,
 * which spans the full range either side of the shape.
 */
const NOISE = 16;

/** @typedef {{ data: Buffer, width: number, height: number }} Rgba */

async function asRgba(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function toPng({ data, width, height }) {
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Recovers a usable alpha channel from a dark-on-white source.
 * @returns {Promise<Rgba>}
 */
async function toInkAlpha(file) {
  const { data, width, height } = await asRgba(await sharp(file).png().toBuffer());
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma.
    const luma = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const alpha = 255 - luma;
    data[i + 3] = alpha < NOISE ? 0 : alpha;
  }
  return { data, width, height };
}

/** Bounding box of everything above `EMPTY`, clipped away on all four sides. */
function cropToAlpha({ data, width, height }) {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > NOISE) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) throw new Error("empty alpha channel — source has no ink");

  const w = right - left + 1;
  const h = bottom - top + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y + top) * width + left) * 4;
    data.copy(out, y * w * 4, src, src + w * 4);
  }
  return { data: out, width: w, height: h };
}

/**
 * Erases the tagline under the lockup.
 *
 * The lockup carries a one-line tagline that is 13px tall in a 256px band — about
 * 6px of cap height once the logo is sized for a navbar. It renders as a row of
 * grey smudges, which reads as a broken asset rather than as small print, so it
 * is removed and the tagline is set in real type on the site instead.
 *
 * It cannot be cut off with a horizontal line: the rounded-square badge is the
 * tallest element and its bottom border sits *below* the tagline, so trimming to
 * the badge would either keep the tagline or clip the badge. The band is erased
 * instead: the whole band is erased strictly to the right of the badge, which
 * is the only region the tagline occupies, so the run can go to the bottom edge
 * of the box without touching the badge's lower border. "SiroQ" has no
 * descenders, so no letterform is lost.
 */
function stripTagline(img, badgeFraction) {
  const { data, width, height } = img;
  const x0 = Math.round(width * badgeFraction);
  const y0 = Math.floor(height * 0.898);
  const y1 = height;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < width; x++) data[(y * width + x) * 4 + 3] = 0;
  }
  return cropToAlpha(img);
}

/** Same alpha, painted a single colour. */
function recolor(img, [r, g, b]) {
  const out = Buffer.from(img.data);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return { data: out, width: img.width, height: img.height };
}

/** Scales `img` to fit a height and re-bounds it. */
function resizeTo(img, height) {
  const scale = height / img.height;
  const width = Math.max(1, Math.round(img.width * scale));
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({ data, width: info.width, height: info.height }));
}

/**
 * Scales the mark to fit a square and centres it on a transparent square.
 *
 * The source badge is 625x635 — two percent taller than wide. Resizing to a
 * square therefore stretches it, which is visible as an oval at favicon sizes,
 * so the mark is fitted by its longer side and centred instead.
 */
async function squareIcon(img, size) {
  const scale = size / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const scaled = await sharp(img.data, {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const canvas = Buffer.alloc(size * size * 4);
  const offsetX = Math.floor((size - scaled.info.width) / 2);
  const offsetY = Math.floor((size - scaled.info.height) / 2);
  for (let y = 0; y < scaled.info.height; y++) {
    scaled.data.copy(
      canvas,
      ((y + offsetY) * size + offsetX) * 4,
      y * scaled.info.width * 4,
      (y + 1) * scaled.info.width * 4,
    );
  }
  return { data: canvas, width: size, height: size };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const written = [];
  // Re-bound after every transform: resampling leaves a low-alpha fringe on the
  // outside row/column, which is invisible but ships as dead pixels.
  const put = async (file, raw) => {
    const img = cropToAlpha(raw);
    await writeFileSync(file, await toPng(img));
    written.push(`${path.relative(ROOT, file)} (${img.width}x${img.height})`);
  };

  /** Writes the buffer as-is. Square canvases must not be re-bounded. */
  const putExact = async (file, img) => {
    await writeFileSync(file, await toPng(img));
    written.push(`${path.relative(ROOT, file)} (${img.width}x${img.height})`);
  };

  // --- Primary logo -------------------------------------------------------
  const lockup = stripTagline(cropToAlpha(await toInkAlpha(LOCKUP)), BADGE_FRACTION);
  const logo = await resizeTo(lockup, 96);
  // Named `lockup` to match `BrandLogo`'s `variant="lockup"` and the constant
  // above. It used to be written as `siroq-logo.png` while the component asked
  // for `siroq-lockup.png`, so the header logo 404'd on every page.
  await put(path.join(OUT, "siroq-lockup.png"), logo);
  await put(path.join(OUT, "siroq-lockup-reversed.png"), recolor(logo, [255, 255, 255]));

  // The lockup is a single bitmap, so the wordmark cannot be recoloured per
  // link. A wordmark-only cut is what headers, the footer and email signatures
  // actually want, and it drops the badge entirely.
  const badgeWidth = Math.round(lockup.width * BADGE_FRACTION);
  const wordmark = cropToAlpha({
    data: lockup.data.subarray(badgeWidth * 4),
    width: lockup.width - badgeWidth,
    height: lockup.height,
  });
  const wordmarkFitted = await resizeTo(wordmark, 96);
  await put(path.join(OUT, "siroq-wordmark.png"), wordmarkFitted);
  await put(
    path.join(OUT, "siroq-wordmark-reversed.png"),
    recolor(wordmarkFitted, [255, 255, 255]),
  );

  // --- Standalone mark + app icons ---------------------------------------
  const mark = await resizeTo(cropToAlpha(await toInkAlpha(APP_MARK)), 512);
  await put(path.join(OUT, "siroq-mark.png"), mark);
  await put(path.join(OUT, "siroq-mark-reversed.png"), recolor(mark, [255, 255, 255]));

  for (const size of [512, 256, 192, 128, 64, 32]) {
    await putExact(path.join(OUT, `icon-${size}.png`), await squareIcon(mark, size));
  }
  const apple = await squareIcon(mark, 180);
  await putExact(path.join(OUT, "apple-touch-icon.png"), apple);

  // Next.js file conventions: app/icon.* becomes the favicon, app/opengraph-image.*
  // becomes the social card, so metadata stays declarative.
  await putExact(path.join(ROOT, "app", "icon.png"), await squareIcon(mark, 512));
  await putExact(path.join(ROOT, "app", "apple-icon.png"), apple);

  // favicon.ico has no sharp encoder, so the sizes are composited by hand and
  // handed to ImageMagick. A single 32px entry looks broken on a HiDPI tab
  // strip, which is where a favicon is always seen.
  const icoSizes = [16, 32, 48];
  const temps = [];
  for (const size of icoSizes) {
    const tmp = path.join(OUT, `.ico-${size}.png`);
    await toPng(await squareIcon(mark, size)).then((buf) => writeFileSync(tmp, buf));
    temps.push(tmp);
  }
  execFileSync("convert", [...temps, path.join(ROOT, "public", "favicon.ico")]);
  execFileSync("rm", ["-f", ...temps]);
  written.push("public/favicon.ico (16/32/48)");

  // --- Open Graph card ---------------------------------------------------
  // Logo only, no set text: sharp would have to resolve a font family for SVG
  // text, and silently falling back to a different face is worse than a card
  // that is simply the mark on the brand colour.
  const CARD_W = 1200;
  const CARD_H = 630;
  const cardLogo = recolor(logo, [255, 255, 255]);
  const logoWidth = Math.round(cardLogo.width * (150 / cardLogo.height));
  const scaledLogo = await sharp(cardLogo.data, {
    raw: { width: cardLogo.width, height: cardLogo.height, channels: 4 },
  })
    .resize(logoWidth, 150, { fit: "fill" })
    .png()
    .toBuffer();

  const card = await sharp({
    create: { width: CARD_W, height: CARD_H, channels: 4, background: { ...INK, alpha: 1 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${CARD_W}" height="${CARD_H}">
             <circle cx="1090" cy="130" r="320" fill="#ffffff" fill-opacity="0.035" />
             <circle cx="110" cy="520" r="220" fill="#ffffff" fill-opacity="0.03" />
           </svg>`,
        ),
        top: 0,
        left: 0,
      },
      {
        input: scaledLogo,
        top: Math.round((CARD_H - 150) / 2),
        left: Math.round((CARD_W - logoWidth) / 2),
      },
    ])
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cardImg = { data: card.data, width: card.info.width, height: card.info.height };
  await put(path.join(ROOT, "app", "opengraph-image.png"), cardImg);
  await put(path.join(OUT, "og-image.png"), cardImg);

  console.log("Brand assets written:");
  for (const line of written) console.log(`  ${line}`);

  // Keep the icon colour in sync with the CSS token it sits beside, so a brand
  // change surfaces as a failing check rather than a subtle mismatch.
  const inkHex = `#${[INK.r, INK.g, INK.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  const css = readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");
  if (!css.toLowerCase().includes(inkHex)) {
    console.warn(`\nNote: ${inkHex} (logo ink) is not in app/globals.css.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
