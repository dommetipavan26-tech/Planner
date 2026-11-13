import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests.
 *
 * These cannot run in every environment: Playwright's browser binaries come from
 * a CDN, so a sandbox without that route can install the package and still have
 * no Chromium to drive. They are written to run on GitHub's runners, where the
 * binaries install cleanly, and `npm run test:browser` fails fast with a clear
 * message locally when they are missing rather than pretending to pass.
 *
 * What they cover that no other gate can: real navigation between prerendered
 * documents, hydration that does not repaint, the ledger's offline fallback with
 * the network actually cut, telemetry delivery to a collector that is present,
 * and axe-core with `color-contrast` enabled — the one rule the jsdom audit has
 * to skip, because contrast needs a layout engine.
 */

const PORT = Number(process.env.PREVIEW_PORT ?? 4173);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: './test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The stylesheet honours this: under `reduce` every `.reveal` is painted at
    // full opacity immediately, so assertions and axe are not racing an entrance
    // animation.
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Set BASE_URL to point the suite at an already-running server — a deployment,
  // for instance — and no server is started here.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: `${BASE_URL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
