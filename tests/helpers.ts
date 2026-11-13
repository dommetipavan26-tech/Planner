import type { Page } from '@playwright/test';
import { SNAPSHOT_CORRIDORS } from '../src/data/snapshot';
import type { Corridor } from '../src/lib/types';

/**
 * Shared setup for the browser suite.
 *
 * Every test cuts the ledger rather than using the real one. Two reasons: the
 * assertions have to be about this build and not about whatever the production
 * database happens to contain at the minute CI runs, and a smoke test must never
 * write to the live ledger — the carrier desk tests sign in and log a bid, which
 * against the real project would leave a row behind on every run.
 *
 * Paths use trailing slashes. `vite preview` does not resolve an extensionless
 * `/carriers` to `dist/carriers/index.html`; it serves the SPA fallback instead.
 * That is a property of the preview server, not of the documents, and one test
 * below pins the fallback behaviour so the difference is recorded rather than
 * discovered by a reader.
 */

export const CORRIDOR_CODES = SNAPSHOT_CORRIDORS.map((c) => c.code);

/** Every prerendered document, as the preview server serves it. */
export const DOCUMENT_ROUTES: Array<{ path: string; label: string }> = [
  { path: '/', label: 'board' },
  { path: '/carriers/', label: 'carrier desk' },
  { path: '/requests/', label: 'request board' },
  { path: '/trips/', label: 'my trips' },
  ...SNAPSHOT_CORRIDORS.map((c) => ({
    path: `/corridor/${c.code}/`,
    label: c.code,
  })),
];

/**
 * Installed before any page script runs. Tags the prerendered root element the
 * moment the parser creates it, so a test can later ask whether that exact
 * element is still the one on screen — React hydrating keeps it, React repainting
 * replaces it. No DOM-only assertion can tell those apart; this one can.
 */
const TAG_PRERENDER = () => {
  const w = window as unknown as { __prerenderFirst?: Element };
  if (w.__prerenderFirst) return;
  const tag = () => {
    const first = document.getElementById('root')?.firstElementChild;
    if (!first || w.__prerenderFirst) return;
    w.__prerenderFirst = first;
    observer.disconnect();
  };
  const observer = new MutationObserver(tag);
  observer.observe(document, { childList: true, subtree: true });
  tag();
};

/** Records everything the app hands to Vercel's collector. */
const RECORD_TELEMETRY = () => {
  const w = window as unknown as {
    va?: (type: string, payload?: unknown) => void;
    __telemetry: Array<{ type: string; payload: unknown }>;
  };
  w.__telemetry = [];
  w.va = (type, payload) => {
    w.__telemetry.push({ type, payload });
  };
};

export async function cutLedger(page: Page): Promise<void> {
  await page.addInitScript(TAG_PRERENDER);
  await page.addInitScript(RECORD_TELEMETRY);

  // The real collector script would replace window.va and stop the recording, so
  // it is blocked; the stub above stands in for it.
  await page.route('**va.vercel-scripts.com/**', (route) => route.abort());
  await page.route('**/_vercel/insights/**', (route) => route.abort());
  await page.route('**/rest/v1/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) => route.abort());

  // WebSockets are not covered by page.route. Without this the channel would open
  // against the live project; with it, the client sees a channel that never
  // answers and reports itself offline, which is the state under test.
  try {
    await page.routeWebSocket('**/realtime/v1/**', () => {
      /* never answers: the client's own timeout path is part of what is tested */
    });
  } catch {
    // Older Playwright, or a pattern it will not accept: the suite still runs,
    // the channel just fails against the network instead.
  }
}

/** True when React kept the element the prerender produced. */
export async function hydratedThePrerender(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as { __prerenderFirst?: Element };
    const root = document.getElementById('root');
    return Boolean(root && w.__prerenderFirst && root.firstElementChild === w.__prerenderFirst);
  });
}

export async function telemetry(page: Page): Promise<Array<{ type: string; payload: any }>> {
  return page.evaluate(() => {
    const w = window as unknown as { __telemetry?: Array<{ type: string; payload: any }> };
    return w.__telemetry ?? [];
  });
}

/** Wait until a named telemetry event has been handed to the collector. */
export async function waitForTelemetry(page: Page, name: string): Promise<Record<string, unknown>> {
  await page.waitForFunction(
    (wanted) => {
      const w = window as unknown as { __telemetry?: Array<{ payload?: { name?: string } }> };
      return (w.__telemetry ?? []).some((entry) => entry.payload?.name === wanted);
    },
    name,
    { timeout: 15_000 },
  );
  const events = await telemetry(page);
  const found = events.find((entry) => entry.payload?.name === name);
  return (found?.payload?.data ?? {}) as Record<string, unknown>;
}

/** A corridor row that is unmistakably not in the bundled snapshot. */
export function probeCorridor(): Corridor {
  const base = SNAPSHOT_CORRIDORS[0];
  if (!base) throw new Error('snapshot has no corridors');
  return {
    ...base,
    id: '00000000-0000-4000-8000-000000000001',
    code: 'TST-PRB-XX00',
    origin_city: 'Probe Origin',
    dest_city: 'Probe Destination',
    origin_code: 'TST',
    dest_code: 'PRB',
    pledged_seats: 7,
    total_allotment: 40,
  };
}

/**
 * Answer the ledger's read calls with fixtures.
 *
 * `routes` is consulted in order and the first match wins, so a test can stub one
 * function and let the helper answer everything else.
 */
export async function stubLedger(
  page: Page,
  routes: Array<{ match: string | RegExp; status?: number; body: unknown }> = [],
): Promise<void> {
  await cutLedger(page);
  await page.unroute('**/rest/v1/**');

  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    for (const candidate of routes) {
      const matches =
        typeof candidate.match === 'string' ? url.includes(candidate.match) : candidate.match.test(url);
      if (!matches) continue;
      await route.fulfill({
        status: candidate.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(candidate.body),
      });
      return;
    }

    // Default answers, so a page can load without a test enumerating every read.
    if (url.includes('/utsav_corridors?')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([probeCorridor(), ...SNAPSHOT_CORRIDORS]),
      });
      return;
    }
    if (url.includes('/utsav_carrier_bids?') || url.includes('/utsav_corridor_requests?')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.includes('/rpc/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

/** An ISO instant this far in the future, for session fixtures. */
export function futureIso(hours = 8): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
