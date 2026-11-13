# 7. Installable, but deliberately not offline

Status: accepted · 2026-11

## Context

Travellers reach the desk from phones, often from a home screen icon, often on
a connection that is bad exactly when a festival block confirms. A service
worker would make the shell instant and would keep the board readable in a
lift or a tunnel. It would also put a cache in front of the one thing this
product must never show stale: how many seats are left in a block, and what a
seat costs right now.

## Decision

The app ships a web manifest and raster icons — generated from the favicon's
own path by `scripts/make-icons.mjs`, so they are reproducible from source —
and installs as a standalone window on Android and iOS. It ships no service
worker and no cache-first anything. A traveller with no connection sees the
prerendered snapshot with its `Snapshot` pill and a ledger-offline event, and
knows the numbers are from the build, which is honest in a way a warm cache is
not.

## Consequences

- Install prompts work; Lighthouse's installability checks pass against the
  manifest and the icons, and `npm run audit` fails if the manifest names an
  icon that is not in `dist/`.
- The maskable icon keeps its artwork inside the 80% safe zone, so Android's
  adaptive masking cannot crop the arc.
- Re-opens are not instant: the shell comes from the HTTP cache and the
  numbers from the ledger, as they do on first visit.
- Revisit only with a strategy that cannot serve a stale seat count: a
  network-only worker for data plus a precached shell, never a cache-first
  worker over ledger responses.
