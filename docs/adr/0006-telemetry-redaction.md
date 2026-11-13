# 6. Telemetry is redacted in the browser, before the queue

Status: accepted · 2026-11

## Context

The desk reports a handful of product events — ledger offline, a write that
was throttled or refused, an uncaught render error — to Vercel Web Analytics.
The useful part of such an event is the message a traveller saw; the dangerous
part is that error messages interpolate whatever they touched, and what they
touch includes desk codes, session tokens, booking references and phone
numbers. A redaction policy that lives in a dashboard, or in a downstream
pipeline, has already lost: the identifier left the browser.

## Decision

`src/lib/telemetry.ts` is the only path to `track()`. Every detail string
passes `redact()` before it is queued: email shapes, UUIDs, hex runs of 32 or
more (session tokens), `UTV-…` booking references and digit runs of ten or
more (phone numbers) become `[email]`, `[id]`, `[token]`, `[ref]`, `[digits]`;
whitespace collapses and the result is capped at 180 characters. UUIDs are
matched before digit runs so a uuid never arrives as four digit runs. The
module is inert outside a browser, caps events per page and per name, dedupes
within five seconds, and retries its flush against `window.va` existing
because `@vercel/analytics` drops events fired before its collector script
loads. Only the last segment of a failing script path is reported — a full URL
carries query strings.

`scripts/ssr-check.tsx` group 13 asserts each redaction rule against a
realistic string, so the policy is tested where it is written.

## Consequences

- A leaked identifier in telemetry now requires bypassing the only export the
  views import, and the render check notices the bypass.
- Debugging from telemetry is deliberately poorer: you get "the sign-in for
  desk [id] was refused", not the desk code. That trade is the point.
- Properties are pre-flattened because `@vercel/analytics` throws on nested
  objects in development and silently strips them in production.
