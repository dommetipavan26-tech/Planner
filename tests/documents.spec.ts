import { expect, test } from '@playwright/test';
import { DOCUMENT_ROUTES, cutLedger, hydratedThePrerender } from './helpers';

/**
 * The twelve prerendered documents, in a browser.
 *
 * The jsdom audit already asserts a great deal about these files as markup. What
 * only a browser can add is that the document a reader receives is the document
 * for the URL they asked for, that React adopts it instead of repainting over it,
 * and that nothing throws while it does.
 */

for (const route of DOCUMENT_ROUTES) {
  test.describe(route.label, () => {
    test(`serves its own prerendered document at ${route.path}`, async ({ page }) => {
      const errors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // React reports hydration mismatches through console.error, not through
      // uncaught exceptions: without this the gate sees a repaint and never the
      // reason for it.
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
      });

      await cutLedger(page);
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });

      expect(response?.status(), `GET ${route.path}`).toBe(200);

      const html = await response?.text();
      const marker = route.path.length > 1 ? route.path.replace(/\/$/, '') : '/';
      expect(html, 'document names the route it was rendered for').toContain(
        `window.__UTSAVAIR_ROUTE__="${marker}"`,
      );
      expect(html, 'the boot loader is stripped from a prerendered document').not.toContain(
        'utsavair-boot',
      );
      expect(html).not.toContain('could not render');

      // The real content, not a shell: the board document carries a corridor code,
      // a corridor document carries its own.
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.locator('h1').first().innerText()).not.toBe('');

      // When this fails, the message carries the browser's own account of what
      // happened: whether the init script tagged anything, what the document
      // claims to be, what the URL is, and whether the node on screen is the
      // node that was parsed. A hydration gate that only says "false" costs a
      // CI round per guess.
      const hydration = await page.evaluate((consoleErrors) => {
        const w = window as unknown as {
          __prerenderFirst?: Element;
          __UTSAVAIR_ROUTE__?: string;
          __UTSAVAIR_BOOT__?: string;
        };
        const root = document.getElementById('root');
        const first = root?.firstElementChild ?? null;

        // Walk the parsed-but-detached server node and the node React left on
        // screen in lockstep and describe the first place they disagree. A
        // production build recovers from a hydration mismatch silently, so this
        // walk is the only witness available.
        const divergence = (a: Node, b: Node): string | null => {
          const path: string[] = [];
          const walk = (x: Node, y: Node): string | null => {
            if (x.nodeType !== y.nodeType) {
              return `${path.join(' > ')}: nodeType ${x.nodeType} vs ${y.nodeType}`;
            }
            if (x.nodeType === 3) {
              const xt = (x.textContent ?? '').replace(/\s+/g, ' ');
              const yt = (y.textContent ?? '').replace(/\s+/g, ' ');
              return xt === yt ? null : `${path.join(' > ')}: text "${xt.slice(0, 60)}" vs "${yt.slice(0, 60)}"`;
            }
            if (x.nodeType !== 1) return null;
            const xe = x as Element;
            const ye = y as Element;
            if (xe.tagName !== ye.tagName) {
              return `${path.join(' > ')}: <${xe.tagName}> vs <${ye.tagName}>`;
            }
            path.push(xe.tagName.toLowerCase());
            for (const attr of Array.from(xe.attributes)) {
              if (ye.getAttribute(attr.name) !== attr.value) {
                return `${path.join(' > ')}: @${attr.name} "${attr.value.slice(0, 60)}" vs "${(ye.getAttribute(attr.name) ?? '').slice(0, 60)}"`;
              }
            }
            const xa = Array.from(xe.childNodes).filter((n) => n.nodeType !== 8);
            const ya = Array.from(ye.childNodes).filter((n) => n.nodeType !== 8);
            if (xa.length !== ya.length) {
              return `${path.join(' > ')}: ${xa.length} children vs ${ya.length}`;
            }
            for (let i = 0; i < xa.length; i += 1) {
              const xc = xa[i];
              const yc = ya[i];
              if (!xc || !yc) return `${path.join(' > ')}: missing child ${i}`;
              const found = walk(xc, yc);
              if (found) return found;
            }
            path.pop();
            return null;
          };
          return walk(a, b);
        };

        const diverged =
          w.__prerenderFirst && first && w.__prerenderFirst !== first
            ? divergence(w.__prerenderFirst, first)
            : null;

        return {
          tagged: Boolean(w.__prerenderFirst),
          same: Boolean(w.__prerenderFirst && first === w.__prerenderFirst),
          marker: w.__UTSAVAIR_ROUTE__ ?? null,
          path: window.location.pathname,
          firstTag: first?.tagName ?? null,
          firstClass: String(first?.className ?? '').slice(0, 48),
          taggedClass: String(w.__prerenderFirst?.className ?? '').slice(0, 48),
          children: root?.children.length ?? -1,
          boot: w.__UTSAVAIR_BOOT__ ?? null,
          diverged,
          consoleErrors: (consoleErrors as string[]).slice(0, 3),
        };
      }, consoleErrors);
      expect(
        hydration.same,
        `React should hydrate the prerendered element, not replace it — ${JSON.stringify(hydration)}`,
      ).toBe(true);

      const unexpected = errors.filter((message) => !/realtime|websocket|socket/i.test(message));
      expect(unexpected, 'uncaught exceptions while loading').toEqual([]);
    });
  });
}

test('an extensionless path falls back to the app shell and still renders its view', async ({
  page,
}) => {
  // `vite preview` does not resolve `/carriers` to `dist/carriers/index.html`; it
  // serves the SPA fallback. The reader still lands on the carrier desk, because
  // the client router reads the path — but they get there by rendering, not by
  // hydration, and this pins that difference instead of leaving it to be found.
  await cutLedger(page);
  const response = await page.goto('/carriers', { waitUntil: 'domcontentloaded' });

  expect(response?.status()).toBe(200);
  const html = await response?.text();
  expect(html, 'the fallback is the board document').toContain('window.__UTSAVAIR_ROUTE__="/"');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Carrier desk/);
  expect(
    await hydratedThePrerender(page),
    'a mismatched document is repainted, so the prerendered element is replaced',
  ).toBe(false);
});

test('client-side navigation keeps one heading and one main landmark', async ({ page }) => {
  await cutLedger(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveCount(1);

  await page.getByRole('link', { name: /^Carriers$/i }).first().click();
  await expect(page).toHaveURL(/\/carriers$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Carrier desk/);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);

  await page.getByRole('link', { name: /Corridor requests|Requests/i }).first().click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Corridor requests/);
  await expect(page.locator('h1')).toHaveCount(1);
});
