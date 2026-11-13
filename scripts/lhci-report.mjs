#!/usr/bin/env node
/**
 * Read the Lighthouse reports a CI run left behind and say what failed.
 *
 * This exists because a Lighthouse failure is otherwise unreadable from outside
 * the runner. Job logs are not always retrievable, and the uploaded artifact is
 * empty when lhci dies before it collects anything — so the two cases that look
 * identical in the checks list, "a budget regressed" and "Lighthouse never ran",
 * are actually opposite in meaning and need opposite responses.
 *
 * It re-derives the verdict from `.lighthouserc.json` rather than trusting a
 * re-run of `lhci assert`: the same reports can be judged against the configured
 * thresholds here, offline, without a second collection.
 *
 * Usage:  node scripts/lhci-report.mjs [reportDir] [--json]
 * Always exits 0. It is a reporting step; the step that failed already set the
 * job status, and masking that with a second failure would only add noise.
 */
import fs from 'node:fs';
import path from 'node:path';

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
    const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    return cfg?.ci?.assert?.assertions || {};
  } catch {
    return {};
  }
}

/**
 * Judge one Lighthouse report against the configured assertions.
 * Keys are either `categories:<id>` or an audit id; values are a level string,
 * `[level, {minScore|maxNumericValue}]`, or `"off"`.
 */
function judge(lhr, assertions) {
  const out = [];
  for (const [key, spec] of Object.entries(assertions)) {
    const level = Array.isArray(spec) ? spec[0] : spec;
    if (level === 'off') continue;
    const opts = Array.isArray(spec) && typeof spec[1] === 'object' && spec[1] !== null ? spec[1] : {};

    // A bare audit id means "this audit must pass outright".
    const minScore = opts.minScore ?? (Array.isArray(spec) ? 1 : 1);
    const maxNumeric = opts.maxNumericValue;

    if (key.startsWith('categories:')) {
      const cat = lhr.categories?.[key.slice('categories:'.length)];
      if (!cat || cat.score === null || cat.score === undefined) continue;
      if (cat.score < minScore) {
        out.push({ level, key, got: cat.score, want: `>= ${minScore}`, kind: 'score' });
      }
      continue;
    }

    const audit = lhr.audits?.[key];
    if (!audit) continue;
    // notApplicable / manual / informative audits carry no verdict.
    if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'manual') continue;
    if (audit.score === null || audit.score === undefined) continue;

    if (typeof maxNumeric === 'number') {
      const value = audit.numericValue;
      if (typeof value === 'number' && value > maxNumeric) {
        out.push({ level, key, got: value, want: `<= ${maxNumeric}`, kind: 'numeric' });
      }
      continue;
    }
    if (audit.score < minScore) {
      out.push({
        level,
        key,
        got: audit.score,
        want: `>= ${minScore}`,
        kind: 'score',
        measured: typeof audit.numericValue === 'number' ? audit.numericValue : undefined,
        unit: audit.numericUnit === 'millisecond' ? 'ms' : audit.numericUnit === 'byte' ? 'B' : undefined,
      });
    }
  }
  return out;
}

function formatValue(finding) {
  if (finding.kind === 'numeric') return `${Math.round(finding.got)}`;
  // A numeric audit can score 0 while the number that matters is the measurement,
  // so show both: "render-blocking-resources 0/100 (300ms)".
  const measured = finding.measured;
  const score = `${Math.round(finding.got * 100)}/100`;
  if (typeof measured === 'number') {
    return `${score} (${measured >= 1000 ? `${(measured / 1000).toFixed(measured >= 10000 ? 0 : 1)}k` : Math.round(measured)}${finding.unit || ''})`;
  }
  return score;
}

function main() {
  if (!fs.existsSync(dir)) {
    say(
      'error',
      `Lighthouse wrote no reports at all (${dir} is absent), so no budget was evaluated. ` +
        'This is not a performance or accessibility regression: lhci failed before collecting, ' +
        'which means Chrome was not found, the CLI could not be fetched, or the preview server ' +
        'did not answer. The cause is in the "Lighthouse budgets" step above.',
    );
    if (asJson) console.log(JSON.stringify({ reports: 0, findings: [] }, null, 2));
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f))
    // lhci writes manifest.json / latest-run.json alongside the lhr-*.json reports.
    .filter((f) => !path.basename(f).startsWith('manifest') && !path.basename(f).startsWith('latest-run'));

  if (!files.length) {
    say(
      'error',
      `Lighthouse wrote a report directory but no reports in it (${dir}), so no budget was evaluated. ` +
        'See the "Lighthouse budgets" step above for the collection failure.',
    );
    if (asJson) console.log(JSON.stringify({ reports: 0, findings: [] }, null, 2));
    return;
  }

  const assertions = loadAssertions();
  if (!Object.keys(assertions).length) {
    say('warning', `${CONFIG} carries no assertions, so there are no configured budgets to check.`);
  }

  const summary = [];
  const warned = new Map(); // rule -> [routes]
  for (const file of files.sort()) {
    let lhr;
    try {
      lhr = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      say('warning', `${path.basename(file)} is not readable as JSON (${err.message}).`);
      continue;
    }
    if (!lhr.categories && !lhr.audits) {
      say('warning', `${path.basename(file)} is not a Lighthouse report.`);
      continue;
    }
    const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || path.basename(file);
    const findings = judge(lhr, assertions);
    const scores = Object.entries(lhr.categories || {})
      .filter(([, c]) => c.score !== null && c.score !== undefined)
      .map(([k, c]) => `${k} ${Math.round(c.score * 100)}`)
      .join(' · ');
    const errors = findings.filter((f) => f.level === 'error');
    summary.push({ url, file: path.basename(file), scores, findings });

    for (const f of findings) {
      if (f.level !== 'warn') continue;
      const list = warned.get(f.key) || [];
      list.push(url);
      warned.set(f.key, list);
    }

    if (!errors.length) {
      if (!asJson) console.log(`[ok] ${url} — ${scores} — every error-level budget holds`);
      continue;
    }
    say(
      'error',
      `${url} — ${scores} — ${errors.length} budget(s) broken: ` +
        errors.map((f) => `${f.key} ${formatValue(f)} (configured ${f.want})`).join('; '),
    );
  }

  if (warned.size) {
    const parts = [...warned.entries()].map(([key, routes]) => `${key} on ${routes.length} route(s)`);
    say('warning', `Warn-level budgets: ${parts.join(', ')}. These do not fail the build.`);
  }

  const broken = summary.filter((r) => r.findings.some((f) => f.level === 'error')).length;
  if (broken === 0 && summary.length) {
    say(
      'warning',
      `All ${summary.length} reports hold every configured budget, so the Lighthouse step failed for a reason the budgets do not explain — ` +
        'read the "Lighthouse budgets" step above for the exit cause.',
    );
  }
  if (asJson) console.log(JSON.stringify({ reports: summary.length, broken, results: summary }, null, 2));
}

main();
