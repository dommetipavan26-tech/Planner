/**
 * The design-token gate.
 *
 * Two failures are invisible to every other check in this repository, and both
 * were hit during the paper redesign:
 *
 * 1. A component asks for a token that `src/index.css` does not define. Tailwind
 *    v4 generates utilities from `@theme`, so an unknown name emits *nothing* —
 *    no error, no warning, just an element with no background or no colour. The
 *    build succeeds, `npm run verify` renders it, and the jsdom audit cannot see
 *    a missing style. Only a browser shows it, and only to someone looking.
 *
 * 2. A background and a foreground in the same class string do not clear WCAG AA
 *    together. jsdom runs axe with `color-contrast` disabled because it has no
 *    layout engine, so a chip with 1.16:1 text sails through the local audit and
 *    is caught only by the browser job in CI — a whole push later.
 *
 * Both are pure string-and-arithmetic checks over the source, so they run here,
 * before a build, in well under a second.
 *
 * The pair check reads the two classes as written and nothing else: it cannot
 * know that a foreground is sometimes overridden by a parent surface, so it only
 * reports pairs that appear together in one class string, which is where a chip,
 * a badge or a button carries its own colours. The browser suite remains the
 * authority on everything inherited; this gate exists so the obvious cases never
 * reach it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CSS = join(ROOT, 'src', 'index.css');
const UTILITY_PREFIXES =
  'bg|text|border|divide|fill|stroke|ring|outline|from|via|to|placeholder|caret|decoration|accent';

/* Palette families. A utility whose token starts with one of these is claiming a
   colour from the design system; anything else (`bg-clip-text`, `text-right`,
   `border-t`, `ring-2`, `fill-none`) is Tailwind's own vocabulary. */
const FAMILIES = /^(page|surface|raised|sunken|hover|press|ink|on-accent|rule|accent|jade|ember|lagoon|clay)/;

/* AA for body text. Nothing on this board sets a colour pair only at 24px, so
   the large-text allowance is not used: a pair either clears 4.5:1 or it is a
   bug. */
const AA = 4.5;

function fail(message) {
  console.error(`  ✗ ${message}`);
  process.exitCode = 1;
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every class string literal in a file — plain quotes and template chunks. */
function classStrings(source) {
  const out = [];
  for (const match of source.matchAll(/["'`]([^"'`]{0,600})["'`]/g)) {
    if (/(?:^|\s)(?:bg|text|border|fill|stroke|shadow|ring)-/.test(match[1])) out.push(match[1]);
  }
  return out;
}

const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const linear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) =>
  0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5));
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(CSS, 'utf8');
const colors = new Map([...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const shadows = new Set([...css.matchAll(/--shadow-([a-z0-9-]+):/g)].map((m) => m[1]));
const radii = new Set([...css.matchAll(/--radius-([a-z0-9-]+):/g)].map((m) => m[1]));
const customClasses = new Set([...css.matchAll(/^\s*\.([a-z][a-z0-9-]*)/gm)].map((m) => m[1]));

const files = sourceFiles(join(ROOT, 'src'));
let utilities = 0;
let pairs = 0;

for (const file of files) {
  const where = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');

  // --- 1. every palette utility resolves to a defined token -----------------
  for (const match of source.matchAll(
    new RegExp(`\\b(?:${UTILITY_PREFIXES})-([a-z]+(?:-[a-z0-9]+)*)(?:\\/[0-9]+)?\\b`, 'g'),
  )) {
    const token = match[1];
    if (!FAMILIES.test(token)) continue;
    utilities += 1;
    if (!colors.has(token)) fail(`${where} uses \`${match[0]}\` but --color-${token} is not defined`);
  }
  for (const match of source.matchAll(/\bshadow-(accent|accent-lift|ring-accent|tab-inset|panel|lift)\b/g)) {
    if (!shadows.has(match[1]) && !customClasses.has(`shadow-${match[1]}`)) {
      fail(`${where} uses \`shadow-${match[1]}\` but it is defined neither as a token nor a utility`);
    }
  }
  for (const match of source.matchAll(/\brounded-(card|pill)\b/g)) {
    if (!radii.has(match[1])) fail(`${where} uses \`rounded-${match[1]}\` but --radius-${match[1]} is not defined`);
  }
  for (const match of source.matchAll(
    /\b(glow-accent|grid-veil|map-veil|sheet-glow|sheen|perforation|barcode|grain|hairline-t|hairline-b|micro-md|micro|display|tnum|telugu|reveal)\b/g,
  )) {
    if (!customClasses.has(match[1])) fail(`${where} uses \`.${match[1]}\` but src/index.css does not define it`);
  }

  // --- 2. a background and a foreground in one class string clear AA --------
  for (const cls of classStrings(source)) {
    const bg = (cls.match(/(?:^|\s)bg-([a-z0-9-]+?)(?:\/\d+)?(?=\s|$)/) || [])[1];
    const fg = (cls.match(/(?:^|\s)text-([a-z0-9-]+?)(?:\/\d+)?(?=\s|$)/) || [])[1];
    if (!bg || !fg || !colors.has(bg) || !colors.has(fg)) continue;
    pairs += 1;
    const ratio = contrast(colors.get(fg), colors.get(bg));
    if (ratio < AA) {
      fail(
        `${where} pairs \`bg-${bg}\` with \`text-${fg}\` at ${ratio.toFixed(2)}:1 (AA needs ${AA}:1)`,
      );
    }
    // Meaningful graphics need 3:1 against what sits behind them, not 4.5:1.
    for (const paint of cls.matchAll(/(?:^|\s)(fill|stroke)-([a-z0-9-]+?)(?:\/\d+)?(?=\s|$)/g)) {
      if (!colors.has(paint[2])) continue;
      const graphic = contrast(colors.get(paint[2]), colors.get(bg));
      if (graphic < 3) {
        fail(`${where} paints \`${paint[1]}-${paint[2]}\` on \`bg-${bg}\` at ${graphic.toFixed(2)}:1 (AA non-text needs 3:1)`);
      }
    }
  }
}

if (process.exitCode) {
  console.error('\ntoken gate failed');
} else {
  console.log(
    `token gate: ${files.length} files, ${utilities} palette utilities resolve, ` +
      `${pairs} background/foreground pairs clear ${AA}:1, ${colors.size} tokens defined`,
  );
}
