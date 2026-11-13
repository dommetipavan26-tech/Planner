#!/usr/bin/env node
/**
 * Read the Lighthouse reports a CI run left behind and say what failed.
 *
 * This exists because a Lighthouse failure is otherwise unreadable from outside
 * the runner. Job logs are not always retrievable, so the two cases that look
 * identical in the checks list — "a budget regressed" and "lhci died before it
 * collected anything" — are actually opposite in meaning and need opposite
 * responses. It also runs on green builds, because a passing run that leaves no
 * numbers behind is a run nobody can compare the next one to.
 *
 * It re-derives the verdict from `.lighthouserc.json` rather than trusting a
 * re-run of `lhci assert`, and it judges the **median** of each URL's runs,
 * because that is what `lhci assert` judges. Reading the runs one at a time
 * disagrees with the gate: on the first green build after this script landed it
 * reported `cumulative-layout-shift` broken on the board, which was true of one
 * run out of three and not of the median the build is judged on. A reporting tool
 * that contradicts the gate it is explaining is worse than no tool, so outliers
 * are named as outliers.
 *
 * Usage:  node scripts/lhci-report.mjs [reportDir] [--json]
 * Always exits 0. It is a reporting step; the step that failed already set the
 * job status, and a second failure would only obscure the first.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dir = args.find((a) => !a.startsWith('--')) || '.lighthouseci';
const CONFIG = '.lighthouserc.json';

/** Emit a GitHub annotation when running inside Actions, and print either way. */
function say(level, message) {
  if (process.env.GITHUB_ACTIONS === 'true' && level !== 'log') {
    console.log(`::${level}::${message.replace(/\n/g, '%0A')}`);
  }
  if (!asJson) console.log(`[${level}] ${message}`);
}

function loadAssertions() {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
    return cfg?.ci?.assert?.assertions || {};
  } catch {
    return {};
  }
}

const median = (values) => {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Fold one URL's runs into a single synthetic report holding the median score and
 * the median measurement for every audit, which is the report `lhci assert` judges.
 */
function medianRun(runs) {
  const base = runs[0];
  const categories = {};
  for (const id of Object.keys(base.categories || {})) {
    categories[id] = { score: median(runs.map((r) => r.categories?.[id]?.score)) };
  }
  const audits = {};
  for (const id of Object.keys(base.audits || {})) {
    audits[id] = {
      scoreDisplayMode: base.audits[id]?.scoreDisplayMode,
      score: median(runs.map((r) => r.audits?.[id]?.score)),
      numericValue: median(runs.map((r) => r.audits?.[id]?.numericValue)),
    };
  }
  return {
    finalDisplayedUrl: base.finalDisplayedUrl || base.finalUrl || base.requestedUrl,
    categories,
    audits,
  };
}

/**
 * Judge one report against the configured assertions. Keys are either
 * `categories:<id>` or an audit id; values are a level string,
 * `[level, {minScore|maxNumericValue}]`, or `"off"`.
 */
function judge(lhr, assertions) {
  const out = [];
  for (const [key, spec] of Object.entries(assertions)) {
    const level = Array.isArray(spec) ? spec[0] : spec;
    if (level === 'off') continue;
    const opts = Array.isArray(spec) && typeof spec[1] === 'object' && spec[1] !== null ? spec[1] : {};
    // A bare audit id means "this audit must pass outright".
    const minScore = opts.minScore ?? 1;
    const maxNumeric = opts.maxNumericValue;

    if (key.startsWith('categories:')) {
      const score = lhr.categories?.[key.slice('categories:'.length)]?.score;
      if (score === null || score === undefined) continue;
      if (score < minScore) out.push({ level, key, got: score, want: `>= ${minScore}`, kind: 'score' });
      continue;
    }

    const audit = lhr.audits?.[key];
    if (!audit) continue;
    // notApplicable and manual audits carry no verdict, and neither does a rule
    // this run did not measure.
    if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'manual') continue;
    if (audit.score === null || audit.score === undefined) continue;

    if (typeof maxNumeric === 'number') {
      if (typeof audit.numericValue === 'number' && audit.numericValue > maxNumeric) {
        out.push({
          level, key, got: audit.numericValue, want: `<= ${maxNumeric}`, kind: 'numeric',
          unit: audit.numericUnit === 'byte' ? 'B' : undefined,
        });
      }
      continue;
    }
    if (audit.score < minScore) {
      out.push({
        level, key, got: audit.score, want: `>= ${minScore}`, kind: 'score',
        measured: typeof audit.numericValue === 'number' ? audit.numericValue : undefined,
        unit: audit.numericUnit === 'millisecond' ? 'ms' : audit.numericUnit === 'byte' ? 'B' : undefined,
      });
    }
  }
  return out;
}

/** The same value read by one run, for naming an outlier against its median. */
function readValue(lhr, key) {
  if (key.startsWith('categories:')) return lhr.categories?.[key.slice('categories:'.length)]?.score;
  const audit = lhr.audits?.[key];
  if (!audit) return undefined;
  return audit.numericValue ?? audit.score;
}

function formatValue(finding) {
  const v = finding.got;
  if (finding.kind === 'numeric') {
    // CLS is a fraction and FCP is milliseconds: one rounding rule would print
    // 0.14 as "0", which reads as a pass.
    if (Math.abs(v) < 1) return v.toFixed(2);
    if (finding.unit === 'B' || v >= 100000) return `${(v / 1024).toFixed(0)}kB`;
    return `${Math.round(v)}`;
  }
  const score = `${Math.round(v * 100)}/100`;
  if (typeof finding.measured === 'number') {
    const m = finding.measured;
    return `${score} (${Math.abs(m) < 1 ? m.toFixed(2) : Math.round(m)}${finding.unit || ''})`;
  }
  return score;
}

function main() {
  if (!existsSync(dir)) {
    say(
      'error',
      `Lighthouse wrote no reports at all (${dir} is absent), so no budget was evaluated. ` +
        'This is not a performance or accessibility regression: lhci failed before collecting, ' +
        'which means Chrome was not found, the CLI could not be fetched, or the preview server ' +
        'did not answer. The cause is in the "Lighthouse budgets" step above.',
    );
    if (asJson) console.log(JSON.stringify({ reports: 0, urls: [] }, null, 2));
    return;
  }

  // lhci writes links.json, assertion-results.json, manifest.json and
  // latest-run.json alongside the reports. Only lhr-*.json is a report; treating
  // the others as one produces a warning per file and hides the real count.
  const files = readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f)).sort();

  if (!files.length) {
    say(
      'error',
      `Lighthouse wrote a report directory but no reports in it (${dir}), so no budget was evaluated. ` +
        'See the "Lighthouse budgets" step above for the collection failure.',
    );
    if (asJson) console.log(JSON.stringify({ reports: 0, urls: [] }, null, 2));
    return;
  }

  const assertions = loadAssertions();
  if (!Object.keys(assertions).length) {
    say('warning', `${CONFIG} carries no assertions, so there are no configured budgets to check.`);
  }

  const byUrl = new Map();
  for (const file of files) {
    let lhr;
    try {
      lhr = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      say('warning', `${file} is not readable as JSON (${err.message}).`);
      continue;
    }
    if (!lhr.categories || !lhr.audits) {
      say('warning', `${file} is not a Lighthouse report.`);
      continue;
    }
    const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || file;
    // Strip the port lhci's own static server picks at random, so three runs of
    // one page group together instead of looking like three pages.
    const key = url.replace(/:\d+/, '');
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(lhr);
  }

  const results = [];
  const warned = new Map(); // rule -> url count
  for (const [url, runs] of [...byUrl].sort()) {
    const med = medianRun(runs);
    const findings = judge(med, assertions);
    const scores = Object.entries(med.categories)
      .filter(([, c]) => c.score !== undefined)
      .map(([k, c]) => `${k} ${Math.round(c.score * 100)}`)
      .join(' · ');
    const errors = findings.filter((f) => f.level === 'error');
    results.push({ url, runs: runs.length, scores, findings });

    for (const f of findings) {
      if (f.level !== 'warn') continue;
      warned.set(f.key, (warned.get(f.key) || 0) + 1);
    }

    if (errors.length) {
      say(
        'error',
        `${url} — median of ${runs.length} run(s) — ${scores} — ${errors.length} budget(s) broken: ` +
          errors.map((f) => `${f.key} ${formatValue(f)} (configured ${f.want})`).join('; '),
      );
      continue;
    }

    // The median held, but a single run may not have. That is not a failure —
    // the gate judges the median — and it is exactly the noise a one-run config
    // would have turned into a red build, so it is worth naming.
    const outliers = [];
    for (const [key, spec] of Object.entries(assertions)) {
      const level = Array.isArray(spec) ? spec[0] : spec;
      if (level !== 'error') continue;
      const opts = Array.isArray(spec) && typeof spec[1] === 'object' && spec[1] !== null ? spec[1] : {};
      for (const run of runs) {
        const single = judge(run, { [key]: spec });
        if (!single.length) continue;
        const value = readValue(run, key);
        outliers.push(
          `${key} measured ${typeof value === 'number' ? (Math.abs(value) < 1 ? value.toFixed(2) : Math.round(value)) : '?'} ` +
            `in one run (configured ${opts.maxNumericValue !== undefined ? `<= ${opts.maxNumericValue}` : `>= ${opts.minScore ?? 1}`})`,
        );
      }
    }
    if (outliers.length) {
      say(
        'notice',
        `${url} — median of ${runs.length} run(s) holds every budget (${scores}), but ${[...new Set(outliers)].join('; ')}. ` +
          'The gate judges the median, so this is noise rather than a regression — until it is not.',
      );
    }
    if (!asJson) console.log(`[ok] ${url} — median of ${runs.length} run(s) — ${scores} — every error-level budget holds`);
  }

  if (warned.size) {
    const parts = [...warned.entries()].map(([key, n]) => `${key} on ${n} route(s)`);
    say('warning', `Warn-level budgets: ${parts.join(', ')}. These do not fail the build.`);
  }

  const broken = results.filter((r) => r.findings.some((f) => f.level === 'error')).length;
  if (broken === 0 && results.length) {
    say(
      'log',
      `All ${results.length} route(s) hold every error-level budget on the median of their runs.`,
    );
    // Job logs are not always retrievable, and the artifact lives on blob storage
    // that a sandbox cannot reach — so on a green build the annotations are the
    // only channel the numbers travel by. One notice carrying every route's
    // median, rather than one per route, to stay well inside the cap.
    say(
      'notice',
      'Lighthouse medians — ' +
        results.map((r) => `${r.url.replace(/^https?:\/\/[^/]+/, '') || '/'}: ${r.scores}`).join(' · ') +
        ` (${results[0].runs} run(s) each; every error-level budget holds)`,
    );
  }
  if (asJson) console.log(JSON.stringify({ reports: files.length, urls: results.length, broken, results }, null, 2));
  process.exitCode = 0;
}

main();
