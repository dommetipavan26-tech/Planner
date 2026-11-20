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
 * Two more were added once the paper identity was measured end to end, because
 * axe cannot see either of them at all:
 *
 * 3. Non-text contrast (WCAG 1.4.11). `color-contrast` is about *text*; nothing
 *    in axe, jsdom or Chromium asks whether a text field's border, a progress
 *    bar's track or a meter's fill can be seen. Three real failures shipped in
 *    the redesign and were found by hand: a field border at 1.36:1, a focus
 *    indicator at 1.70:1, and a marigold meter fill at 1.63:1 against its own
 *    track — the board's most common graphic, effectively invisible. The tokens
 *    that carry those jobs are declared below and held to 3:1 against every
 *    surface they can sit on, so the numbers in the CSS comment cannot drift
 *    away from the numbers in the file.
 *
 * 4. A foreground used on its own, with no background in the same class string.
 *    The pair check only sees `bg-x text-y` written together, so `text-accent`
 *    on an inherited surface — 1.96:1, decoration pretending to be a label —
 *    would walk through. Every palette token used as a foreground anywhere in
 *    `src/**` is therefore measured against every surface in the system.
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

/* AA for graphics and component boundaries (WCAG 1.4.11). */
const NON_TEXT = 3;

/* The panels a control or a graphic can sit on. `hover` and `press` belong here
   because a control turns into them while it is being used, and a boundary that
   clears 3:1 only at rest has not cleared it during the click. */
const CONTROL_SURFACES = ['page', 'surface', 'raised', 'sunken', 'hover', 'press'];

/* The panels running text can sit on: the same ramp minus the two transient
   control states, plus every status tint, because a paragraph can land inside a
   tinted panel. `hover` and `press` are excluded deliberately — the only text
   that ever sits on them is a control's own label, which is written in the same
   class string as the background and is therefore measured by the pair check
   above. Requiring every foreground token to clear AA against a pressed button
   would report combinations that do not occur, and a gate that cries wolf gets
   deleted. */
const TEXT_SURFACES = [
  'page',
  'surface',
  'raised',
  'sunken',
  'accent-tint',
  'accent-tint-strong',
  'jade-tint',
  'ember-tint',
  'ember-tint-strong',
  'lagoon-tint',
  'clay-tint',
  'clay-tint-strong',
];

/* The panels a graphic can sit on. `press` is not here: nothing draws a graphic
   on a pressed control, and where a graphic *is* the pressed state the pair is
   checked against its own neighbour by the state check below. */
const GRAPHIC_SURFACES = ['page', 'surface', 'raised', 'sunken', 'hover'];

/* Tokens whose whole job is to be *seen*, rather than read. Each must clear
   NON_TEXT against every surface above. This list is the design system's claim
   about which of its colours carry meaning on their own; adding a control that
   depends on a boundary means adding its token here. */
const BOUNDARIES = [
  { token: 'edge', role: 'component boundary — fields, buttons, meter track', on: CONTROL_SURFACES },
  { token: 'accent-deep', role: 'focus indicator, meter fill, seat map, swatch', on: GRAPHIC_SURFACES },
  { token: 'jade', role: 'meter fill, threshold reached', on: GRAPHIC_SURFACES },
  { token: 'lagoon', role: 'meter fill, price band', on: GRAPHIC_SURFACES },
  { token: 'ember', role: 'price band, danger fill', on: GRAPHIC_SURFACES },
  { token: 'clay', role: 'swatch, coach fill', on: GRAPHIC_SURFACES },
];

/* Tailwind's own black and white are not tokens, but they are real paints: the
   ember, lagoon and clay fills carry white type. Resolving them lets the pair
   check measure those instead of skipping them. */
const KEYWORD_PAINTS = { white: '#ffffff', black: '#000000' };

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

function extractBlock(source, header) {
  const idx = source.indexOf(header);
  if (idx === -1) return '';
  const open = source.indexOf('{', idx);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

function parseColorTokens(block) {
  return new Map([...block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}

const css = readFileSync(CSS, 'utf8');
const lightBlock = extractBlock(css, '@theme');
const darkBlock = extractBlock(css, "[data-theme='dark']");
const colors = parseColorTokens(lightBlock || css);
const darkOverrides = parseColorTokens(darkBlock);
const themes = darkOverrides.size > 0
  ? [
      { name: 'light', map: colors },
      { name: 'dark', map: new Map([...colors, ...darkOverrides]) },
    ]
  : [{ name: 'light', map: colors }];
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
    if (!bg || !fg) continue;
    for (const theme of themes) {
      const bgPaint = theme.map.get(bg) || KEYWORD_PAINTS[bg];
      const fgPaint = theme.map.get(fg) || KEYWORD_PAINTS[fg];
      if (!bgPaint || !fgPaint) continue;
      if (theme.name === 'light') pairs += 1;
      const ratio = contrast(fgPaint, bgPaint);
      if (ratio < AA) {
        fail(
          `[${theme.name}] ${where} pairs \`bg-${bg}\` with \`text-${fg}\` at ${ratio.toFixed(2)}:1 (AA needs ${AA}:1)`,
        );
      }
      // Meaningful graphics need 3:1 against what sits behind them, not 4.5:1.
      for (const paint of cls.matchAll(/(?:^|\s)(fill|stroke)-([a-z0-9-]+?)(?:\/\d+)?(?=\s|$)/g)) {
        const paintHex = theme.map.get(paint[2]) || KEYWORD_PAINTS[paint[2]];
        if (!paintHex) continue;
        const graphic = contrast(paintHex, bgPaint);
        if (graphic < 3) {
          fail(`[${theme.name}] ${where} paints \`${paint[1]}-${paint[2]}\` on \`bg-${bg}\` at ${graphic.toFixed(2)}:1 (AA non-text needs 3:1)`);
        }
      }
    }
  }
}

/* --- 3. component boundaries and graphics clear the non-text minimum ------- */
let boundaries = 0;
for (const theme of themes) {
  for (const { token, role, on } of BOUNDARIES) {
    const hex = theme.map.get(token);
    if (!hex) {
      fail(`[${theme.name}] --color-${token} is declared a boundary token here but is not defined in src/index.css`);
      continue;
    }
    if (theme.name === 'light') boundaries += 1;
    for (const surface of on) {
      const behind = theme.map.get(surface);
      if (!behind) {
        fail(`[${theme.name}] surface \`${surface}\` is not defined in src/index.css`);
        continue;
      }
      const ratio = contrast(hex, behind);
      if (ratio < NON_TEXT) {
        fail(
          `[${theme.name}] --color-${token} (${role}) is ${ratio.toFixed(2)}:1 against \`${surface}\`; ` +
            `a boundary a reader has to see needs ${NON_TEXT}:1`,
        );
      }
    }
  }
}

/* --- 4. every foreground token is legible on every surface ----------------- */
const foregrounds = new Map(); // token -> first place it was used
for (const file of files) {
  const where = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\btext-([a-z]+(?:-[a-z0-9]+)*)(?:\/[0-9]+)?\b/g)) {
    const token = match[1];
    if (!FAMILIES.test(token) || !colors.has(token)) continue;
    if (!foregrounds.has(token)) foregrounds.set(token, where);
  }
}
for (const theme of themes) {
  for (const [token, where] of foregrounds) {
    // `on-accent` is paired exclusively with `bg-accent` / `bg-jade` fills (checked above).
    if (theme.name === 'dark' && token === 'on-accent') continue;
    for (const surface of TEXT_SURFACES) {
      const behind = theme.map.get(surface);
      if (!behind) continue;
      const ratio = contrast(theme.map.get(token), behind);
      if (ratio < AA) {
        fail(
          `[${theme.name}] ${where} sets \`text-${token}\`, which is ${ratio.toFixed(2)}:1 against \`${surface}\` ` +
            `(AA needs ${AA}:1). As a foreground this token is decoration, not a label.`,
        );
        break; // one report per token is enough to find it
      }
    }
  }
}

/* --- 5. two states of one thing have to be distinguishable ------------------ */
let states = 0;
for (const file of files) {
  const where = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');
  const pattern =
    /\?\s*(['"`])bg-([a-z0-9-]+)(\/[0-9]+)?\1\s*:\s*(['"`])bg-([a-z0-9-]+)(\/[0-9]+)?\4/g;
  for (const match of source.matchAll(pattern)) {
    const [, , onState, onAlpha, , offState, offAlpha] = match;
    if (!(colors.get(onState) || KEYWORD_PAINTS[onState]) || !(colors.get(offState) || KEYWORD_PAINTS[offState])) {
      continue;
    }

    const before = source.slice(Math.max(0, match.index - 120), match.index);
    const condition = before.split(/[?:,;(]/).pop() ?? '';
    if (/[!=]==/.test(condition)) continue; // a choice between categories

    states += 1;
    if (onAlpha || offAlpha) {
      fail(
        `${where} encodes a state as \`bg-${onState}${onAlpha || ''}\` against ` +
          `\`bg-${offState}${offAlpha || ''}\`. A translucent state fill has no fixed ` +
          `contrast — it takes whatever sits behind it — so it has to be opaque.`,
      );
      continue;
    }
    for (const theme of themes) {
      const paint = (name) => theme.map.get(name) || KEYWORD_PAINTS[name];
      const ratio = contrast(paint(onState), paint(offState));
      if (ratio < NON_TEXT) {
        fail(
          `[${theme.name}] ${where} encodes a state as \`bg-${onState}\` against \`bg-${offState}\` at ` +
            `${ratio.toFixed(2)}:1 (AA non-text needs ${NON_TEXT}:1)`,
        );
      }
    }
  }
}

if (process.exitCode) {
  console.error('\ntoken gate failed');
} else {
  console.log(
    `token gate (${themes.map((t) => t.name).join(' + ')}): ${files.length} files, ${utilities} palette utilities resolve, ` +
      `${pairs} background/foreground pairs clear ${AA}:1, ` +
      `${boundaries} boundary tokens clear ${NON_TEXT}:1 against the panels they sit on, ` +
      `${states} state pairs distinguishable, ${foregrounds.size} foreground tokens legible ` +
      `on all ${TEXT_SURFACES.length} text-bearing panels, ${colors.size} tokens defined`,
  );
}
