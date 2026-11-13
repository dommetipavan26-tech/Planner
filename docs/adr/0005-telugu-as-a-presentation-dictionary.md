# 5. Telugu place names are a render-time dictionary, not a column

Status: accepted · 2026-11

## Context

The desk exists for Telugu travellers going home for a festival, and every
place name on it was English-only. The two homes for a second language are the
database — a `origin_city_te` column beside every name — and the client. A
column means a migration, a seed change, an admin story for keeping two
languages in step, and a public API that grows a field per language per
release. A dictionary means a file with no deploy coupling to the ledger.

The board names nine cities and a handful of localities, and the ledger holds
exactly one name per city: a second language is presentation, not data.

## Decision

`src/lib/telugu.ts` maps lowercased place tokens and whole festival labels to
Telugu, and `src/index.css` carries a `.telugu` utility that names the Telugu
faces every target platform already ships — Noto Sans Telugu on Android and
Linux, Telugu Sangam MN on Apple, Nirmala UI on Windows. Rendered names sit
under the English label with `lang="te"`, so a screen reader switches voice and
line-breaking follows the script.

Two rules keep the dictionary honest. A label translates wholly or not at all:
`teluguFor` returns null unless every token is known, so the UI can never show
half a translation. Separators are preserved exactly, because "Guntur /
Amaravati" and "Vijayawada (Amaravati)" carry meaning in their punctuation.
`npm run verify` fails if any city on the board lacks a Telugu name, so a new
corridor cannot ship with a gap a reader would notice and a maintainer would
not.

No webfont. The Telugu subset of Noto Sans Telugu is roughly 36 kB of woff2 on
every corridor page to render one secondary line, on platforms that already
have a Telugu face; if a platform ever lacks one the name degrades to a
system fallback rather than to nothing.

## Consequences

- Adding a city means adding two lines to a dictionary, with the render check
  as the reminder.
- The ledger, its migrations and its public shape are untouched.
- If the board grows past a dozen corridors, or a second language arrives, the
  dictionary is the wrong shape and this decision should be reversed in favour
  of columns — the check that fails on a missing name is also the list of what
  a migration would have to populate.
