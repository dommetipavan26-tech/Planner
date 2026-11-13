/**
 * Prerender.
 *
 * Writes every route a traveller can land on as static HTML into `dist/`, so a
 * corridor URL is a document rather than a promise: a crawler, a link preview, a
 * reader on a connection that drops before the bundle arrives and the browser's
 * first paint all get the same real content.
 *
 * Three rules keep it honest.
 *
 * 1. Same tree, same data. This renders the real `<App />` with the real
 *    `useLedger()`, which is snapshot-first, so the markup is exactly what the
 *    browser's first render produces. Nothing here is a separate "SEO version"
 *    of the page that could drift from the app.
 * 2. Same clock. Anything derived from "now" starts at `PRERENDERED_AT`, which
 *    is injected into the document; `main.tsx` hydrates only when the injected
 *    route matches `location.pathname`, and `ClockProvider` re-anchors to the
 *    real time in a layout effect, before paint. A stale countdown is therefore
 *    never visible — only never mismatched.
 * 3. Fail loudly. A page that renders the error boundary, loses the wordmark, or
 *    omits its own corridor code aborts the build instead of shipping an empty
 *    shell that looks prerendered.
 *
 * Run after `vite build`: npm run prerender
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { prerenderToNodeStream } from 'react-dom/static';

import AppStatic from '../src/AppStatic';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ClockProvider } from '../src/hooks/useClock';
import { PRERENDERED_AT } from '../src/lib/buildTime';
import {
  absoluteUrl,
  escapeHtml,
  routeDescription,
  routeTitle,
} from '../src/lib/meta';
import { RouterProvider, corridorPath, matchPath } from '../src/lib/router';
import { SNAPSHOT_CORRIDORS } from '../src/data/snapshot';
import type { Corridor } from '../src/lib/types';

const DIST = resolve(process.cwd(), 'dist');

/** The pre-hydration loader: scaffolding for a client-only render, gone here. */
const BOOT_LOADER = /\s*<div id="boot"[\s\S]*?<\/div>/;

interface Page {
  /** Path a browser would request. */
  path: string;
  /** Where the document is written, relative to `dist/`. */
  file: string;
  /** The corridor row, for pages that have one. */
  corridor: Corridor | null;
  /** How often the ledger realistically moves this page. */
  cadence: 'hourly' | 'daily';
  priority: string;
}

function pages(): Page[] {
  const out: Page[] = [{ path: '/', file: 'index.html', corridor: null, cadence: 'hourly', priority: '1.0' }];

  for (const corridor of SNAPSHOT_CORRIDORS) {
    const path = corridorPath(corridor.code);
    out.push({
      path,
      file: `${path.slice(1)}/index.html`,
      corridor,
      cadence: 'hourly',
      priority: '0.9',
    });
  }

  out.push(
    { path: '/carriers', file: 'carriers/index.html', corridor: null, cadence: 'daily', priority: '0.6' },
    { path: '/requests', file: 'requests/index.html', corridor: null, cadence: 'daily', priority: '0.6' },
    // Device-scoped, so the prerender is the empty state every first-time
    // visitor sees; a returning traveller's pledges arrive after hydration, as
    // they already do today.
    { path: '/trips', file: 'trips/index.html', corridor: null, cadence: 'daily', priority: '0.4' },
  );

  return out;
}

/**
 * Render one route to a string.
 *
 * `prerenderToNodeStream` from `react-dom/static`, not `renderToPipeableStream`:
 * the streaming API emits a pending Suspense boundary as a fallback plus a
 * hidden completion div and an inline `$RC` swap script, which is right for a
 * socket and wrong for a file. In a browser that swap script runs at parse time,
 * and when the boundary id it names is gone it removes the completed content
 * instead of moving it — leaving the lazy view's region empty until hydration
 * rebuilds it, which is a repaint, not a hydration. The static API waits for
 * every boundary and writes the finished markup inline, which is what a document
 * on disk has to contain. (`renderToString` cannot be used either: the routed
 * views are lazy, and it would emit the fallback as the page.)
 */
async function renderRoute(path: string): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <ErrorBoundary>
      <ClockProvider>
        <RouterProvider initialPath={path}>
          <AppStatic />
        </RouterProvider>
      </ClockProvider>
    </ErrorBoundary>,
    {
      onError(error: unknown) {
        throw error instanceof Error ? error : new Error(String(error));
      },
    },
  );

  const chunks: string[] = [];
  for await (const chunk of prelude) {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
  }
  return chunks.join('');
}

/**
 * Collapse any streaming completion instructions into finished markup.
 *
 * The static renderer writes a Suspense boundary whose content lands after the
 * shell in the streaming shape: a pending marker, the fallback, a hidden div
 * carrying the finished content, and an inline `$RC` script that a browser would
 * run at parse time to swap one for the other. On a socket that is progress; on
 * a file it is a trap — the swap runs before the deferred bundle hydrates, and
 * hydration then rebuilds the page instead of adopting it. Everything a document
 * on disk needs is the finished markup, so the swap is performed here instead:
 * the pending marker and fallback are replaced by the hidden div's content under
 * a completed marker, and the runtime scripts are dropped.
 *
 * Fails loudly if anything survives: a document that still carries a `$RC` is a
 * document that will repaint in a browser, and the browser suite asserts that it
 * does not.
 */
function settle(html: string, path: string): string {
  let out = html;

  for (;;) {
    const open = out.indexOf('<!--$?-->');
    if (open === -1) break;

    const template = out.indexOf('<template id="B:', open);
    if (template === -1 || template > open + 40) {
      throw new Error(`${path}: pending boundary without a recoverable template at ${open}`);
    }
    const idStart = template + '<template id="'.length;
    const idEnd = out.indexOf('"', idStart);
    const boundaryId = out.slice(idStart, idEnd);
    const completionId = `S:${boundaryId.slice(2)}`;

    const dom = new JSDOM(out);
    const completion = dom.window.document.getElementById(completionId);
    if (!completion) {
      throw new Error(`${path}: boundary ${boundaryId} has no completion div ${completionId}`);
    }
    const content = completion.innerHTML;
    dom.window.close();

    const close = out.indexOf('<!--/$-->', open);
    if (close === -1) {
      throw new Error(`${path}: pending boundary ${boundaryId} is never closed`);
    }
    const finished = `<!--$-->${content}<!--/$-->`;
    out = out.slice(0, open) + finished + out.slice(close + '<!--/$-->'.length);

    // The hidden completion div and the parse-time runtime are dead weight now.
    const hiddenOpen = out.indexOf(`<div hidden id="${completionId}">`);
    if (hiddenOpen !== -1) {
      // The completion div wraps the view's own root element, which contains divs
      // of its own, so its end is found by balancing, not by searching.
      let depth = 0;
      let i = hiddenOpen;
      let end = -1;
      while (i < out.length) {
        const nextOpen = out.indexOf('<div', i);
        const nextClose = out.indexOf('</div>', i);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth += 1;
          i = nextOpen + 4;
        } else {
          depth -= 1;
          i = nextClose + 6;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) throw new Error(`${path}: unbalanced completion div ${completionId}`);
      out = out.slice(0, hiddenOpen) + out.slice(end);
    }
  }

  out = out.replace(/<script>requestAnimationFrame\(function\(\)\{\$RT=[\s\S]*?<\/script>/, '');
  out = out.replace(/<script>[\s\S]*?\$RC\([\s\S]*?<\/script>\s*/, '');

  if (out.includes('$RC(') || out.includes('<!--$?-->') || out.includes('hidden id="S:')) {
    throw new Error(`${path}: streaming completion instructions survived settling`);
  }
  return out;
}

/** Replace everything between `<!--name-->` and `<!--/name-->`, markers included. */
function region(html: string, name: string, content: string): string {
  const open = `<!--${name}-->`;
  const close = `<!--/${name}-->`;
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `index.html has no ${open} … ${close} region. ` +
        'Prerender reads dist/index.html as its template, so a page that has ' +
        'already been prerendered cannot be used as one — run vite build first.',
    );
  }
  return html.slice(0, start) + content + html.slice(end + close.length);
}

function assemble(template: string, page: Page, markup: string): string {
  const route = matchPath(page.path);
  const title = routeTitle(route, page.corridor);
  const description = routeDescription(route, page.corridor);
  const url = absoluteUrl(page.path);

  const meta = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ].join('\n    ');

  // Read by src/lib/buildTime.ts on the client: the clock both sides start from,
  // and the route this document was rendered for, which decides hydrate-or-render.
  const head =
    `<script>window.__UTSAVAIR_PRERENDERED_AT__=${PRERENDERED_AT};` +
    `window.__UTSAVAIR_ROUTE__=${JSON.stringify(page.path)};</script>`;

  let html = region(template, 'utsavair:meta', meta);
  // Replacement is a function, never a string: React markup can contain `$`
  // sequences that String.prototype.replace would otherwise interpret.
  html = html.replace('<!--utsavair:head-->', () => head);
  html = html.replace('<!--utsavair:app-->', () => markup);
  html = html.replace(BOOT_LOADER, '');

  if (html.includes('<!--utsavair:app-->') || html.includes('id="boot"')) {
    throw new Error(`${page.path}: the boot loader survived assembly`);
  }
  return html;
}

/** The rendered tree has to be the page, not a graceful failure to draw it. */
function assertReal(page: Page, markup: string): void {
  if (markup.length < 8_000) {
    throw new Error(`${page.path}: rendered only ${markup.length} bytes — expected a full page`);
  }
  if (markup.includes('could not render')) {
    throw new Error(`${page.path}: rendered the error boundary`);
  }
  if (!markup.includes('UTSAVAIR')) {
    throw new Error(`${page.path}: rendered without the wordmark`);
  }
  if (page.corridor && !markup.includes(page.corridor.code)) {
    throw new Error(`${page.path}: rendered without its own corridor code`);
  }
}

function sitemap(list: Page[]): string {
  const lastmod = new Date(PRERENDERED_AT).toISOString().slice(0, 10);
  const urls = list.map(
    (page) => `  <url>
    <loc>${escapeHtml(absoluteUrl(page.path))}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.cadence}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

async function main(): Promise<void> {
  const template = await readFile(resolve(DIST, 'index.html'), 'utf8');
  const list = pages();
  const written: string[] = [];

  for (const page of list) {
    const markup = settle(await renderRoute(page.path), page.path);
    assertReal(page, markup);
    const html = assemble(template, page, markup);
    const target = resolve(DIST, page.file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
    written.push(`${page.path} → ${page.file} (${(html.length / 1024).toFixed(1)} kB)`);
  }

  await writeFile(resolve(DIST, 'sitemap.xml'), sitemap(list), 'utf8');

  console.log(`prerendered ${list.length} routes + sitemap.xml`);
  for (const line of written) console.log(`  ${line}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
