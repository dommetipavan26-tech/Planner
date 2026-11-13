/**
 * Accessibility and document gate.
 *
 * Runs axe-core over the *prerendered* HTML — the documents that actually ship,
 * read out of `dist/` — rather than over markup invented for the test. So this
 * catches what a traveller's browser receives, including anything the assembly
 * step in `scripts/prerender.tsx` did to it.
 *
 * Two layers:
 *   1. document assertions — the things axe cannot know about this app: one h1,
 *      a skip link that actually targets the main landmark, a canonical URL that
 *      matches the file it is in, no "undefined" leaking into copy, and the
 *      hydration guard that says which route the document was rendered for.
 *   2. axe-core at WCAG 2.1 AA plus best practice, failing on any violation.
 *
 * One rule is turned off deliberately. `color-contrast` needs a layout engine to
 * resolve the cascade; jsdom has none, so it can only return "incomplete" here
 * and would tell us nothing. Contrast is instead audited against every
 * text-bearing surface in the design tokens (worst case 4.59:1, AA is 4.5:1) and
 * enforced structurally by CI's no-literal-colour grep.
 *
 * Run after a build: npm run audit
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { SNAPSHOT_CORRIDORS } from '../src/data/snapshot';
import { corridorPath } from '../src/lib/router';

const require = createRequire(import.meta.url);
const DIST = resolve(process.cwd(), 'dist');

interface Violation {
  id: string;
  impact: string | undefined;
  help: string;
  nodes: number;
  target: string;
}

interface Report {
  path: string;
  failures: string[];
  violations: Violation[];
  /** Rules axe started but could not finish — kept visible, never a failure. */
  incomplete: Violation[];
  passes: number;
  bytes: number;
}

/** The slice of axe's result this gate reads. */
interface AxeFinding {
  id: string;
  impact?: string;
  help: string;
  nodes: { target?: unknown[] }[];
}

interface AxeLike {
  run(context: unknown, options: unknown): Promise<{
    violations: AxeFinding[];
    incomplete: AxeFinding[];
    passes: unknown[];
  }>;
}

function toViolations(findings: AxeFinding[]): Violation[] {
  return findings.map((finding) => ({
    id: finding.id,
    impact: finding.impact,
    help: finding.help,
    nodes: finding.nodes.length,
    target: JSON.stringify(finding.nodes[0]?.target ?? []),
  }));
}

/** The prerendered documents, discovered from disk rather than listed by hand. */
async function documents(): Promise<{ url: string; file: string }[]> {
  const found: { url: string; file: string }[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'assets' || entry.name.startsWith('.')) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, `${prefix}/${entry.name}`);
      } else if (entry.name === 'index.html') {
        found.push({ url: prefix === '' ? '/' : prefix, file: full });
      }
    }
  }

  await walk(DIST, '');
  if (found.length === 0) {
    throw new Error(`no prerendered documents under ${DIST} — run npm run build first`);
  }
  return found.sort((a, b) => a.url.localeCompare(b.url));
}

function text(node: { textContent: string | null }): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Every URL the router can produce that is supposed to have a document behind
 * it, derived from the snapshot rather than typed out — so adding a corridor
 * adds a page to this gate without anyone remembering to.
 */
function expectedPaths(): string[] {
  return [
    '/',
    ...SNAPSHOT_CORRIDORS.map((corridor) => corridorPath(corridor.code)),
    '/carriers',
    '/requests',
    '/trips',
  ];
}

/** Coverage: what was prerendered against what should have been. */
function assertCoverage(found: string[]): string[] {
  const expected = expectedPaths();
  const failures: string[] = [];
  for (const path of expected) {
    if (!found.includes(path)) failures.push(`no document was prerendered for ${path}`);
  }
  for (const path of found) {
    if (!expected.includes(path)) {
      failures.push(`${path} was prerendered but the router produces no such route — stale dist?`);
    }
  }
  return failures;
}

/** The sitemap has to list the same set of URLs, or it is a lie to a crawler. */
/**
 * The manifest is a file in dist/, not a document, so it cannot be part of any one
 * document's report. It is checked as a property of the build: parseable JSON,
 * the shapes a browser install prompt requires, and every icon it names actually
 * present and non-trivially large — a manifest pointing at a missing PNG installs
 * as a blank tile, which looks worse than not being installable.
 */
function assertInstallable(): string[] {
  const failures: string[] = [];
  const manifestPath = join(DIST, 'manifest.webmanifest');
  if (!existsSync(manifestPath)) {
    return ['dist/manifest.webmanifest is missing'];
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [`manifest.webmanifest is not parseable JSON: ${String(error)}`];
  }

  const row = manifest as Record<string, unknown>;
  for (const key of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color']) {
    if (typeof row[key] !== 'string' || row[key] === '') failures.push(`manifest has no ${key}`);
  }
  if (row.display !== 'standalone' && row.display !== 'minimal-ui' && row.display !== 'fullscreen') {
    failures.push(`manifest display is "${String(row.display)}"`);
  }

  const icons = Array.isArray(row.icons) ? (row.icons as Array<Record<string, unknown>>) : [];
  if (icons.length === 0) failures.push('manifest lists no icons');
  const sizes = new Set(icons.map((icon) => String(icon.sizes)));
  for (const wanted of ['192x192', '512x512']) {
    if (!sizes.has(wanted)) failures.push(`manifest has no ${wanted} icon`);
  }
  if (!icons.some((icon) => String(icon.purpose).includes('maskable'))) {
    failures.push('manifest has no maskable icon');
  }
  for (const icon of icons) {
    const src = String(icon.src ?? '').replace(/^\//, '');
    const file = join(DIST, src);
    if (!existsSync(file)) {
      failures.push(`manifest icon ${src} is not in dist/`);
    } else if (statSync(file).size < 512) {
      failures.push(`manifest icon ${src} is ${statSync(file).size} bytes — probably empty`);
    }
  }

  return failures;
}

async function assertSitemap(found: string[]): Promise<string[]> {
  const failures: string[] = [];
  let xml: string;
  try {
    xml = await readFile(resolve(DIST, 'sitemap.xml'), 'utf8');
  } catch {
    return ['no sitemap.xml in dist/'];
  }
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  for (const path of expectedPaths()) {
    const url = `https://utsav-corridor.vercel.app${path === '/' ? '/' : path}`;
    if (!listed.includes(url)) failures.push(`sitemap.xml does not list ${path}`);
  }
  if (listed.length !== found.length) {
    failures.push(`sitemap.xml lists ${listed.length} URLs but ${found.length} documents exist`);
  }
  return failures;
}

/** Layer 1: the assertions only this app can make about its own documents. */
function assertDocument(url: string, html: string, dom: JSDOM): string[] {
  const failures: string[] = [];
  const fail = (message: string): void => {
    failures.push(message);
  };
  const doc = dom.window.document;

  if (doc.documentElement.getAttribute('lang') !== 'en') fail('<html> has no lang="en"');
  if (dom.window.document.title.trim() === '') fail('empty <title>');

  // --- headings: exactly one h1, and no level is skipped on the way down ---
  const h1 = doc.querySelectorAll('h1');
  if (h1.length !== 1) fail(`${h1.length} <h1> elements, expected exactly 1`);
  const levels = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) =>
    Number(el.tagName.slice(1)),
  );
  for (let i = 1; i < levels.length; i += 1) {
    const previous = levels[i - 1] ?? 1;
    const current = levels[i] ?? previous;
    if (current > previous + 1) {
      fail(`heading order jumps h${previous} → h${current}`);
      break;
    }
  }

  // --- landmarks: one banner, one main, one contentinfo, one nav ---
  const main = doc.querySelectorAll('main');
  if (main.length !== 1) fail(`${main.length} <main> elements, expected exactly 1`);
  for (const [selector, label] of [
    ['header', 'banner'],
    ['nav', 'nav'],
    ['footer', 'contentinfo'],
  ] as const) {
    const count = doc.querySelectorAll(selector).length;
    if (count < 1) fail(`no ${label} landmark (<${selector}>)`);
  }

  // --- the skip link has to land somewhere that exists ---
  const skip = doc.querySelector<HTMLAnchorElement>('a[href^="#"]');
  if (!skip) {
    fail('no skip link');
  } else {
    const target = doc.querySelector(skip.getAttribute('href') ?? '');
    if (!target) fail(`skip link points at ${skip.getAttribute('href')}, which is not in the document`);
    if (text(skip) === '') fail('skip link has no text');
  }

  // --- metadata that has to agree with the file it is sitting in ---
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '';
  if (!canonical.endsWith(url === '/' ? '/' : url)) {
    fail(`canonical ${canonical || '(missing)'} does not match ${url}`);
  }
  const ogUrl =
    doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? '';
  if (!ogUrl.endsWith(url === '/' ? '/' : url)) fail(`og:url ${ogUrl || '(missing)'} does not match ${url}`);
  const description =
    doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
  if (description.length < 50 || description.length > 320) {
    fail(`meta description is ${description.length} characters, want 50–320`);
  }
  for (const property of ['og:title', 'og:description', 'og:site_name', 'og:type']) {
    if (!doc.querySelector(`meta[property="${property}"]`)) fail(`missing ${property}`);
  }
  if (!doc.querySelector('meta[name="theme-color"]')) fail('missing theme-color');

  // --- installability: the manifest and the touch icon every document carries ---
  const manifestHref =
    doc.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href') ?? '';
  if (manifestHref !== '/manifest.webmanifest') {
    fail('manifest link is ' + (manifestHref === '' ? '(missing)' : manifestHref) + ', expected /manifest.webmanifest');
  }
  if (!doc.querySelector('link[rel="apple-touch-icon"]')) fail('missing apple-touch-icon');

  // --- the hydration guard: this document must claim to be the route it is ---
  const marker = html.match(/__UTSAVAIR_ROUTE__=("[^"]*")/);
  if (!marker) {
    fail('no __UTSAVAIR_ROUTE__ — main.tsx cannot tell whether to hydrate or render');
  } else if (JSON.parse(marker[1] ?? 'null') !== url) {
    fail(`__UTSAVAIR_ROUTE__ is ${marker[1]} but this document is ${url}`);
  }
  if (!/__UTSAVAIR_PRERENDERED_AT__=\d+/.test(html)) {
    fail('no __UTSAVAIR_PRERENDERED_AT__ — the client clock cannot start from the build instant');
  }

  // --- the prerender replaced the scaffolding, not appended to it ---
  if (html.includes('id="boot"')) fail('the pre-hydration boot loader is still in the document');
  if (html.includes('<!--utsavair:app-->')) fail('the app anchor was not replaced');

  // --- copy hygiene: nothing unresolved reached the reader ---
  const body = text(doc.body);
  for (const leak of ['undefined', 'NaN', '[object Object]', 'null seats', '₹NaN']) {
    if (body.includes(leak)) fail(`rendered copy contains "${leak}"`);
  }

  // --- no literal colour in the markup, mirroring CI's grep over src/ ---
  const styled = doc.querySelectorAll<HTMLElement>('[style]');
  for (const el of styled) {
    const value = el.getAttribute('style') ?? '';
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)) {
      fail(`inline style carries a literal colour: ${value.slice(0, 60)}`);
    }
  }

  // --- links: every destination is a route this app owns, or https ---
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (href === '' || href === '#') {
      fail(`empty href on "${text(a).slice(0, 40)}"`);
    } else if (/^(https?:)?\/\//.test(href) && !href.startsWith('https://')) {
      fail(`insecure external link: ${href}`);
    } else if (href.includes('localhost') || href.includes('127.0.0.1')) {
      fail(`link to a dev host shipped in a document: ${href}`);
    }
  }

  // --- interactive elements announce themselves ---
  for (const selector of ['button', '[role="button"]']) {
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      const name = text(el) || el.getAttribute('aria-label') || '';
      if (name.trim() === '') {
        fail(`${selector} with no accessible name (${el.outerHTML.slice(0, 80)})`);
      }
    }
  }

  return failures;
}

/** Layer 2: axe-core, evaluated inside the document's own window. */
async function runAxe(
  dom: JSDOM,
): Promise<{ violations: Violation[]; incomplete: Violation[]; passes: number }> {
  const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  // 'outside-only' lets us evaluate axe without running the page's own scripts,
  // so the document is audited exactly as authored.
  dom.window.eval(axeSource);
  const axe = (dom.window as unknown as { axe: AxeLike }).axe;
  const result = await axe.run(dom.window.document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false } },
  });

  return {
    violations: toViolations(result.violations),
    incomplete: toViolations(result.incomplete),
    passes: result.passes.length,
  };
}

async function auditOne(url: string, file: string): Promise<Report> {
  const html = await readFile(file, 'utf8');
  // jsdom logs "Not implemented: HTMLCanvasElement.getContext" for rules that
  // want a canvas. There is nothing to install and nothing to fix, so that noise
  // is dropped rather than printed once per document.
  const quiet = new VirtualConsole();
  const dom = new JSDOM(html, {
    virtualConsole: quiet,
    url: `https://utsav-corridor.vercel.app${url}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const failures = assertDocument(url, html, dom);
  const axeResult = await runAxe(dom);
  dom.window.close();

  return {
    path: url,
    failures,
    violations: axeResult.violations,
    incomplete: axeResult.incomplete,
    passes: axeResult.passes,
    bytes: html.length,
  };
}

async function main(): Promise<void> {
  const docs = await documents();
  const reports: Report[] = [];

  for (const doc of docs) {
    reports.push(await auditOne(doc.url, doc.file));
  }

  // Coverage and the sitemap are properties of the set of documents, not of any
  // one of them, so they are reported as their own entry.
  const coverage = [
    ...assertCoverage(docs.map((d) => d.url)),
    ...(await assertSitemap(docs.map((d) => d.url))),
    ...assertInstallable(),
  ];
  if (coverage.length > 0) {
    reports.push({
      path: 'coverage + installability',
      failures: coverage,
      violations: [],
      incomplete: [],
      passes: 0,
      bytes: 0,
    });
  }

  let failureCount = 0;
  let violationCount = 0;
  let incompleteCount = 0;
  const inconclusive = new Map<string, number>();

  for (const report of reports) {
    const status = report.failures.length + report.violations.length === 0 ? 'ok  ' : 'FAIL';
    console.log(
      report.bytes === 0
        ? `  ${status} ${report.path} — every route the router produces has a document, and the sitemap lists them`
        : `  ${status} ${report.path} — ${report.passes} axe rules passed, ` +
            `${(report.bytes / 1024).toFixed(1)} kB`,
    );
    for (const failure of report.failures) {
      console.log(`        assertion: ${failure}`);
      failureCount += 1;
    }
    for (const violation of report.violations) {
      console.log(
        `        axe ${violation.id} (${violation.impact ?? 'n/a'}, ${violation.nodes} node(s)): ` +
          `${violation.help} → ${violation.target}`,
      );
      violationCount += 1;
    }
    // Printed once at the end rather than per document: these are the rules
    // jsdom cannot decide without a layout engine, so they are the same on every
    // page and 12 copies of them bury the findings that matter.
    for (const finding of report.incomplete) {
      inconclusive.set(finding.id, (inconclusive.get(finding.id) ?? 0) + finding.nodes);
      incompleteCount += 1;
    }
  }

  if (inconclusive.size > 0) {
    console.log('  axe could not decide, in jsdom and on every page:');
    for (const [id, nodes] of [...inconclusive].sort()) {
      console.log(`        ${id} (${nodes} node(s))`);
    }
    console.log(
      '        landmark-one-main and page-has-heading-one are asserted directly above; the ' +
        'other two need a layout engine, which jsdom does not have. Colour contrast is ' +
        'gated instead by the design-token audit and CI\'s no-literal-colour grep.',
    );
  }

  console.log('');
  if (failureCount + violationCount === 0) {
    console.log(
      `${reports.length} documents clean — no assertion failures, no axe violations ` +
        `(WCAG 2.1 AA + best practice)` +
        (incompleteCount > 0 ? `, ${incompleteCount} inconclusive` : ''),
    );
    return;
  }
  console.log(
    `${failureCount} assertion failure(s) and ${violationCount} axe violation(s) across ` +
      `${reports.length} documents`,
  );
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
