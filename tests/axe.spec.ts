import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { DOCUMENT_ROUTES, cutLedger } from './helpers';

/**
 * axe-core in a real browser, with `color-contrast` enabled.
 *
 * `npm run audit` runs the same rule set against the same documents inside jsdom,
 * and it has to disable `color-contrast` there: contrast is computed from rendered
 * colours, and jsdom has no layout engine. That leaves the single most common
 * WCAG failure on a dark, token-driven design ungated — the reason this file
 * exists. Everything else is asserted twice on purpose, because the two
 * environments disagree about enough (hidden elements, computed styles, focus)
 * that a rule passing in one is not evidence about the other.
 */

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const RUN_ONLY = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

interface AxeNode {
  target: string[];
  html: string;
}

interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  helpUrl: string;
  nodes: AxeNode[];
}

interface AxeResult {
  violations: AxeViolation[];
  incomplete: Array<{ id: string; nodes: AxeNode[] }>;
  passes: Array<{ id: string }>;
}

for (const route of DOCUMENT_ROUTES) {
  test(`${route.label} has no axe violations in a browser`, async ({ page }) => {
    await cutLedger(page);
    await page.goto(route.path, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axeSource });

    const result = await page.evaluate(
      async (tags) => {
        const axe = (window as unknown as { axe: any }).axe;
        return (await axe.run(document, {
          runOnly: { type: 'tag', values: tags },
        })) as AxeResult;
      },
      RUN_ONLY,
    );

    // Proof the run did something: a result with no passes is a result that did
    // not execute, which would otherwise look like a clean page.
    expect(result.passes.length, 'axe actually ran').toBeGreaterThan(20);
    expect(
      result.passes.some((pass) => pass.id === 'color-contrast'),
      'color-contrast ran here, unlike in the jsdom audit',
    ).toBe(true);

    const summary = result.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join(' | ')}`,
    );
    expect(summary, `axe violations on ${route.path}`).toEqual([]);

    const unresolved = result.incomplete
      .map((entry) => entry.id)
      .filter((id) => id === 'color-contrast');
    expect(
      unresolved,
      'elements axe could not resolve a contrast ratio for should be rare and explained',
    ).toEqual([]);
  });
}

test('the sign-in sheet is accessible too', async ({ page }) => {
  // The gated sheet is a document state no prerender contains, so the jsdom audit
  // never sees it.
  await cutLedger(page);
  await page.goto('/carriers/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Sign in to the carrier desk/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: any }).axe;
    return (await axe.run(document, { runOnly: { type: 'tag', values: tags } })) as AxeResult;
  }, RUN_ONLY);

  const summary = result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, 'axe violations in the open sign-in sheet').toEqual([]);
});
