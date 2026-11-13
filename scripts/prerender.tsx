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
import { Writable } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';

import App from '../src/App';
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
 * `renderToPipeableStream` with `onAllReady` rather than `renderToString`,
 * because the routed views are lazy: `renderToString` cannot wait for an import
 * and would happily emit the Suspense fallback as the page.
 */
function renderRoute(path: string): Promise<string> {
  return new Promise<string>((done, fail) => {
    const chunks: string[] = [];
    let settled = false;

    const { pipe } = renderToPipeableStream(
      <ErrorBoundary>
        <ClockProvider>
          <RouterProvider initialPath={path}>
            <App />
          </RouterProvider>
        </ClockProvider>
      </ErrorBoundary>,
      {
        onAllReady() {
          const sink = new Writable({
            write(chunk: unknown, _encoding: unknown, callback: () => void) {
              chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
              callback();
            },
          });
          sink.on('finish', () => {
            if (settled) return;
            settled = true;
            done(chunks.join(''));
          });
          sink.on('error', (error: Error) => {
            if (settled) return;
            settled = true;
            fail(error);
          });
          pipe(sink);
        },
        onError(error: unknown) {
          if (settled) return;
          settled = true;
          fail(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );
  });
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
    const markup = await renderRoute(page.path);
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
