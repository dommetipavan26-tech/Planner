# 1. Prerendered documents at build time, not a server at request time

Status: accepted · 2026-11 · superseded by nothing

## Context

The board is eight corridors, a carrier desk, a request list and a trips page.
Every route's first paint is the same shape: numbers that change when the
ledger changes, chrome that never changes. The two obvious architectures were a
Node server rendering per request, or a static export of one HTML document plus
client-side routing.

A per-request server costs a cold start on the first traveller of the morning,
and it costs a runtime to keep alive for a board whose authoritative numbers
live in Supabase anyway — the server would be a cache in front of a database
that already has a CDN in front of it. A single-document SPA gives crawlers one
URL and gives a traveller on a slow festival-morning connection a blank page
while 145 kB of JavaScript explains what a corridor is.

## Decision

`scripts/prerender.tsx` renders every route the router can produce — twelve
documents, one per route including the eight corridor pages — to
`dist/<route>/index.html` at build time, with the route's own title,
description, canonical and Open Graph tags, and a `window.__UTSAVAIR_ROUTE__`
marker naming the document. The client reads the marker and hydrates the
document it finds; if the marker disagrees with the URL it renders from
scratch instead of mutating someone else's markup. A `sitemap.xml` falls out of
the same pass.

Rendering happens through `react-dom/static`'s `prerenderToNodeStream` against
a static-only App variant whose views are imported eagerly (`src/AppStatic.tsx`,
imported by nothing else, so route splitting in the browser bundle is untouched):
`renderToString` cannot await a lazy import, and a render that suspends — even
for a microtask — makes the renderer flush the shell first and write the
completed view in the streaming shape (pending marker, hidden completion div,
inline `$RC` swap script). In a browser that swap runs at parse time, ahead of
the deferred bundle, and hydration rebuilds the page rather than adopting it; a
`settle()` pass in the prerender therefore collapses any such instructions into
finished markup, and `npm run audit` fails a document that still carries them.
Determinism is a
requirement, not a nicety: anything that differs between build and browser —
the clock, the live ledger, sessionStorage — is gated behind
`useIsoLayoutEffect`/`useMounted` or read in an effect, and `npm run audit`
fails the build if any document lacks its marker or still carries the boot
scaffolding.

## Consequences

- First paint is the document itself; the countdown and the tier metres are
  already on the page before the ledger chunk arrives.
- Crawlers see real documents with real per-route metadata. The sitemap and
  the documents cannot drift apart because one pass writes both.
- The ledger chunk (78 kB raw, 23 kB gzipped after ADR-4) is fetched after
  first paint, not before it.
- Build time grows by one render per route, and a new route must be added to
  the prerender list — `npm run audit` fails the build when the router can
  produce a route with no document, so the list cannot silently lag.
- `vite preview` does not resolve extensionless paths to directory indexes, so
  the browser suite and any local probe must request `/carriers/` with the
  trailing slash. Vercel serves the directory index; the preview server's
  fallback to the board document is asserted as intended behaviour instead.

Revisit if a route needs per-visitor server data before first paint; nothing
on the board does today, and desk sessions are per-device, not per-visitor.
