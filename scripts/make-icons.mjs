/**
 * Draws the installable icons from the same artwork as the favicon.
 *
 * The favicon in index.html is an inline SVG: a paper-coloured rounded square, a
 * marigold corridor arc, an ink origin dot and a marigold destination dot. The
 * PWA manifest needs rasterised versions of it, and there is no image pipeline in
 * this project to produce them, so this script rasterises that exact path — same
 * cubic Bézier, same stroke width, same radii, same three token colours — with a
 * small PNG encoder built on node:zlib.
 *
 * Run it with `npm run icons` and commit the output. Nothing in the build or in CI
 * depends on it; it exists so the icons are reproducible from source rather than
 * being binaries nobody can regenerate.
 *
 * The maskable variant keeps the artwork inside the inner 80% safe zone and bleeds
 * the background to the edges, which is what Android's adaptive icons require.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

/* Colours straight out of src/index.css --color-page, --color-accent, --color-ink.
   The mark is unchanged from the dark identity — a corridor curving from an
   origin dot to a destination dot — but the stock it is printed on is paper now,
   so the origin dot is ink rather than ink and the field is warm white. An icon
   that was a dark tile reads as a hole in a light browser chrome; this one reads
   as a stamp. */
const PAPER = [246, 244, 239];
const MARIGOLD = [232, 163, 61];
const INK = [20, 24, 31];

/* The favicon path, in the 32-unit viewBox it was drawn in. */
const VIEW = 32;
const CORNER = 7;
const CURVE = [
  [8.5, 22.5],
  [14, 21],
  [18.5, 17],
  [23.5, 9],
];
const STROKE = 1.8;
const ORIGIN = { at: [8.5, 22.5], r: 2.6, colour: INK };
const DEST = { at: [23.5, 9], r: 2.6, colour: MARIGOLD };

/* ------------------------------------------------------------------ png */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // One filter byte per scanline, filter 0 (none): the artwork is flat colour, so
  // there is nothing for a predictor to gain and zlib does the work.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ art */

/** Point on the cubic Bézier at t. */
function curvePoint(t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  const [p0, p1, p2, p3] = CURVE;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

const SAMPLES = 96;
const POLYLINE = Array.from({ length: SAMPLES + 1 }, (_, i) => curvePoint(i / SAMPLES));

function distanceToCurve(x, y) {
  let best = Infinity;
  for (let i = 0; i < POLYLINE.length - 1; i++) {
    const [ax, ay] = POLYLINE[i];
    const [bx, by] = POLYLINE[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best) best = dist;
  }
  return best;
}

/** Signed distance to a rounded square, in viewBox units. */
function roundedSquareCoverage(x, y, half, radius) {
  const dx = Math.abs(x) - half + radius;
  const dy = Math.abs(y) - half + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/**
 * Paint one icon.
 *
 * `maskable` scales the artwork into the inner safe zone and bleeds the
 * background to the edges with no rounding.
 */
function render(size, { maskable = false } = {}) {
  const scale = size / VIEW;
  const artScale = maskable ? 0.8 : 1;
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / 3; // 3x3 supersampling

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let paper = 0;
      let marigold = 0;
      let ink = 0;

      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const x = (px + (sx + 0.5) * step) / scale;
          const y = (py + (sy + 0.5) * step) / scale;

          // Background: rounded square, or full bleed when maskable.
          if (maskable) {
            paper += 1;
          } else {
            const dist = roundedSquareCoverage(x - VIEW / 2, y - VIEW / 2, VIEW / 2, CORNER);
            if (dist <= -0.5) paper += 1;
            else if (dist < 0.5) paper += 0.5 - dist;
          }

          // Artwork, pulled into the safe zone for the maskable variant.
          const cx = (x - VIEW / 2) / artScale + VIEW / 2;
          const cy = (y - VIEW / 2) / artScale + VIEW / 2;

          const strokeDist = distanceToCurve(cx, cy) - STROKE / 2;
          if (strokeDist <= -0.5) marigold += 1;
          else if (strokeDist < 0.5) marigold += 0.5 - strokeDist;

          for (const dot of [ORIGIN, DEST]) {
            const dist = Math.hypot(cx - dot.at[0], cy - dot.at[1]) - dot.r;
            const cover = dist <= -0.5 ? 1 : dist < 0.5 ? 0.5 - dist : 0;
            if (cover <= 0) continue;
            if (dot.colour === INK) ink += cover;
            else marigold += cover;
          }
        }
      }

      const total = 9;
      const aIvory = Math.min(1, ink / total);
      const aMarigold = Math.min(1, marigold / total);
      const aPaper = Math.min(1, paper / total);

      // Paint back to front: paper, then marigold, then ink. Each layer is the
      // source over what is already there — source-over, so a fully opaque lower
      // layer must not swallow the one above it.
      let [r, g, b] = [0, 0, 0];
      let alpha = 0;
      for (const [colour, coverage] of [
        [PAPER, aPaper],
        [MARIGOLD, aMarigold],
        [INK, aIvory],
      ]) {
        if (coverage <= 0) continue;
        const source = coverage;
        const out = source + alpha * (1 - source);
        r = out === 0 ? 0 : (colour[0] * source + r * alpha * (1 - source)) / out;
        g = out === 0 ? 0 : (colour[1] * source + g * alpha * (1 - source)) / out;
        b = out === 0 ? 0 : (colour[2] * source + b * alpha * (1 - source)) / out;
        alpha = out;
      }

      const offset = (py * size + px) * 4;
      rgba[offset] = Math.round(r);
      rgba[offset + 1] = Math.round(g);
      rgba[offset + 2] = Math.round(b);
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, rgba);
}

/* ------------------------------------------------------------------ out */

mkdirSync(OUT, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const target of targets) {
  const png = render(target.size, { maskable: Boolean(target.maskable) });
  writeFileSync(join(OUT, target.file), png);
  console.log(`${target.file.padEnd(22)} ${String(target.size).padStart(4)}px  ${(png.length / 1024).toFixed(2)} kB`);
}
