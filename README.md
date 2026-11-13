# UtsavAir — festival corridor desk

[![CI](https://github.com/dommetipavan26-tech/Planner/actions/workflows/ci.yml/badge.svg)](https://github.com/dommetipavan26-tech/Planner/actions/workflows/ci.yml)

Pooled group allotment for the routes that surge hardest during Indian festival
travel. A carrier contracts a block of seats for one departure; travellers pledge
into it; the moment the cohort crosses a threshold, **every** pledged seat
reprices down to the contracted slab — including the seats that joined first.

Production: **https://utsav-corridor.vercel.app** (Vercel team Deployment
Protection is on, so the alias asks you to sign in).

> This is a working prototype, not a ticketing agent. No payment is captured, no
> ticket is issued, and no inventory is owned. Fares are contractual group rates
> from carrier desks; the platform fee is disclosed on every figure.

---

## The model in one screen

| | |
|---|---|
| **Block** | A carrier contracts N seats/berths for one festival departure at a net group fare, with a hold window and a contract reference. |
| **Pledge** | A traveller reserves 1–8 seats in the cohort. Free today: no card is charged, names swap free until T‑72h (air) or T‑6h (coach). |
| **Tier slab** | Three contractual thresholds — 15 / 30 / 45 seats on air, 15 / 30 / 40 on coach. Crossing one reprices the whole cohort, not just the newest pledge. |
| **Lock deadline** | If Tier I is never reached, every pledge is released and the allotment goes back to the carrier. Nothing to refund, because nothing moved. |
| **Platform fee** | 4.5% of the carrier net fare on air, 4.0% on coach. Shown as its own line everywhere; never netted off the carrier's rate. |

Eight corridors are live. **Six air blocks** — two out of Vijayawada (the
Sankranti flagship on AI‑460 and the Kartika Purnima / winter-wedding-peak block),
one inbound Delhi→Vijayawada, and one each from Visakhapatnam, Rajahmundry and
Tirupati — plus **two coach blocks**, Bengaluru→Guntur and Hyderabad→Vijayawada.
Festival surge fares across them run **2.48×–3.78×** the off-season fare
(`surgeMultiple()` on every row; the coach blocks surge hardest because a berth on
the night of Sankranti is the one thing nobody will discount).

---

## Routes

| Path | View |
|---|---|
| `/` | Live board: routing diagram, desk totals, filterable corridor grid or compare table, pledge feed, mechanics, tier slabs, fee disclosure, refund rules |
| `/corridor/:code` | One corridor: price anatomy, tier ladder, allotment map, operations, cohort, the carrier bid behind the block, sticky pledge rail |
| `/trips` | Your pledges and watched corridors, read back from Postgres by device id |
| `/carriers` | Supply side: every bid logged against a corridor, plus a form that writes one |
| `/requests` | Demand side: request a corridor, upvote one, and the threshold policy that turns a request into a contracted block |

**Every one of those paths is prerendered to static HTML at build time** — 12
documents: the board, one per corridor code (eight), carriers, requests and trips.
So a deep link is a document, not a promise: a crawler, a link preview in a family
group chat, and a traveller whose connection drops before the bundle arrives all
get the real corridor, its tier ladder and its fare. `vercel.json` still rewrites
unmatched paths to `index.html`, which is how an unknown code or a typo degrades to
a useful page instead of a blank one.

`/trips` is device-scoped, so its document is the empty state every first-time
visitor sees; a returning traveller's pledges arrive the moment the ledger answers,
as they always have.

---

## Stack

- **Vite 7 + React 19 + TypeScript** (`strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, `noUnusedLocals/Parameters`).
- **Tailwind CSS 4** with a hand-authored `@theme` design system in
  `src/index.css`. **No component carries a literal colour** — not in a class, not
  in an inline style, not in an SVG attribute. Every hue, radius, easing curve and
  shadow is a token; glows and shadows are `color-mix()`ed from the palette rather
  than restated as `rgba()`, so changing `--color-marigold` recolours the button
  glow, the focus ring and the chart arcs together. (Lightning CSS statically
  resolves each `color-mix` at build time and ships a literal fallback alongside
  it, so this costs nothing at runtime.)
- **Supabase Postgres** as the ledger: tables, RLS, `SECURITY DEFINER` functions
  and Realtime. No backend of our own.
- **No router dependency.** `src/lib/router.tsx` is 129 lines: path matching,
  `<Link>` that preserves cmd/middle-click, and scroll restoration.
- **Route-level code splitting.** Five views are `lazy()` behind one `Suspense`
  boundary with a fallback that names the route it is loading (`aria-busy` region,
  a `role="status"` sentence, and a skeleton tree marked `aria-hidden` so it is
  felt rather than read). The board stays eager: it is the landing route, so
  splitting it would only add a request.
- **Prerender + hydrate.** `scripts/prerender.tsx` renders the real `<App />` —
  the same tree, the same `useLedger()`, the same snapshot — into `dist/`, and
  `main.tsx` hydrates that markup rather than repainting over it. Nothing here is
  a separate "SEO version" of the page that could drift from the app.

```
src/
  lib/        types · format (all money/date/corridor maths) · supabase · device · router · normalise
              meta (route titles and descriptions) · buildTime (the prerender instant)
  hooks/      useLedger (queries, realtime, mutations) · useClock · useAnimatedNumber
  data/       snapshot.ts — mirror of the production ledger for offline/first paint
  components/ ui · icons · AppShell · CorridorCard · NetworkMap · Pricing · JoinSheet · Explainers · ErrorBoundary
  views/      Corridors · Corridor · Trips · Carriers · Requests · NotFound
scripts/      ssr-check.tsx — the render check behind `npm run verify`
              prerender.tsx — writes all 12 routes to static HTML in dist/
              dom-check.tsx — axe-core plus document assertions behind `npm run audit`
public/       robots.txt, pointing at the generated sitemap.xml
supabase/     mirrors of the applied migrations
```

**One rule the codebase keeps:** no component does arithmetic. Every rupee,
percentage, countdown, tier and saving is derived in `src/lib/format.ts`, and
every row arriving from PostgREST passes through `src/lib/normalise.ts` (which
coerces `numeric` strings and nulls) before anything renders it.

---

## Data & security

Five tables, all RLS-enabled, all in the `supabase_realtime` publication:

| Table | anon SELECT | anon INSERT | anon UPDATE |
|---|---|---|---|
| `utsav_corridors` | ✅ | — | — |
| `utsav_carrier_bids` | ✅ | ✅ | — |
| `utsav_corridor_requests` | ✅ | ✅ | — |
| `utsav_pledges` | **none** | **none** | — |
| `utsav_corridor_watches` | **none** | **none** | — |

The publishable anon key ships to the browser by design, so the interesting
question is what it can reach. Pledges and watches have **no anonymous policy at
all**; they are touched only through `SECURITY DEFINER` functions:

| Function | Purpose |
|---|---|
| `utsav_join_cohort(corridor, name, phone, cohort, boarding_point, seats, device_id)` | Row-locks the corridor, validates seats 1–8 / name ≥3 chars / 10-digit mobile, refuses to oversell the allotment, recomputes the slab and status, writes the receipt. **Idempotent and rate-limited** — see below |
| `utsav_public_pledges(limit)` | Public activity feed — projected **without** phone numbers, boarding points and device ids |
| `utsav_my_pledges(device_id)` | Owner-scoped full rows |
| `utsav_my_watches` / `utsav_watch_corridor` / `utsav_unwatch_corridor` | Device-scoped watch list |
| `utsav_upvote_request(request_id)` | The only way an upvote moves |

**A pledge write is idempotent, and it has a pace limit.** The same device asking
for the same corridor, the same seat count and the same lead passenger within two
minutes is a retry — a double-tapped button, or a second attempt after a response
that never arrived — so the function returns the pledge it already wrote instead of
writing another one, and the block does not lose a second seat to it. A different
traveller on the same corridor has a different name, so a family booking two
cohorts is not caught by it. Beyond that, one device gets a pledge every five
seconds and can hold twelve live ones; both refusals raise SQLSTATE `UT429`, which
the client maps to "give it a few seconds" rather than to a fake local receipt (a
throttled write did not happen, so there is nothing to mirror).

That limit is honest about its own reach: `device_id` is minted in the browser, so
anyone can make more of them. It stops accidents and casual hammering, not a
determined abuser — closing that properly means putting pledge writes behind
authentication. The oversell guarantee is separate and older, and it does hold: the
corridor row is locked `FOR UPDATE` first, so concurrent joins serialise and cannot
take a block past `total_allotment`. All three behaviours are tested against the
live function inside a rolled-back transaction (retry returns the same row and moves
`pledged_seats` once; a second device is unaffected; twelve live pledges refuse a
thirteenth; eleven accept a twelfth; released pledges do not count).

Two consequences worth knowing:

1. **Realtime pledge payloads never reach an anonymous subscriber** (RLS withholds
   them). The app therefore treats a corridor `UPDATE` as the pledge signal —
   every pledge write moves `pledged_seats` and `allotment_status` — and re-reads
   the feed through its projection.
2. **The device id is a capability, not an identity.** It is a random UUID in
   `localStorage`; `utsav_my_pledges` will return rows for whatever UUID you hand
   it. Unguessable, and honest about being a prototype stand-in for auth.

Migration history lives in Supabase; `supabase/migrations/` holds reviewed
mirrors (`utsav_corridor_schema_and_seed`, `utsav_corridor_enrichment_v2`,
`utsav_privacy_hardening_v2_1`, `utsav_join_throttle_v2_2`) so the schema can be
read and rebuilt from source. **Do not re-apply them to the live project.**

---

## Performance

- **Snapshot-first paint.** `src/data/snapshot.ts` is a byte-for-byte mirror of
  the production ledger, so the board renders complete on the first frame — no
  spinner, no layout shift, no empty state while Postgres answers. When live rows
  land, numbers tween into place and the status pill flips from *Connecting* to
  *Live ledger*. If Postgres is unreachable the desk keeps working and says so
  (banner + *Snapshot* pill + a note on any receipt written locally).
- **The Supabase SDK is lazy-loaded** (~59 kB gzip) and therefore off the critical
  path: first paint never waits for it.
- **Chunking,** after route splitting: `react` 221.70 kB / 68.96 gzip · app
  138.35 kB / 39.66 gzip · CSS 54.01 kB / 10.56 gzip · five view chunks
  1.74–19.60 kB raw (0.89–5.87 gzip) that arrive only for the route being visited ·
  `ledger` 226.47 kB / 59.57 gzip, still on demand · `insights` 6.50 kB / 2.29
  gzip, mounted after the route is interactive. First paint went from 121.57 kB of
  JavaScript (gzip) to 108.62 kB — about 11% less — and a corridor deep link no
  longer downloads the other five views. Nothing exceeds the 260 kB budget CI
  enforces.
- **Prerendered documents.** All 12 routes ship as static HTML (15–126 kB each),
  so the first thing a traveller sees on a deep link is the corridor, not a
  skeleton. `main.tsx` hydrates that markup only when the document was rendered for
  the path being requested; otherwise it renders fresh. Everything the two renders
  could disagree about — the clock, the footer year, a device id from
  `localStorage` — starts from one injected build instant (`PRERENDERED_AT`) and
  corrects itself in a layout effect before paint, so a stale countdown is never
  *visible*, only never mismatched. `npm run verify` asserts the board renders
  byte-identically twice, which is what keeps that true.
- **Metrics are lazy, and they still measure the real page.** `@vercel/analytics`
  and `@vercel/speed-insights` are thin shims that read *buffered*
  `PerformanceObserver` entries, so mounting them after hydration does not lose the
  navigation they are there to record — and they stay out of the framework chunk
  (`vite.config.ts` buckets vendor code by package name at the `node_modules/`
  boundary, because a substring match on `/react/` also matched
  `@vercel/analytics/react/` and quietly pulled instrumentation into React).
- **Two clocks.** A 1 Hz tick is right for a countdown and wrong for a grid of
  cards, so `useNow()` is consumed only by small leaf components (`<Countdown>`,
  `<ClockStamp>`) while cards and lists read a 30 s `useCoarseNow()`. A board of
  eight live countdowns costs eight leaf re-renders a second, not eight cards.
- **Fonts** are unicode-ranged variable/latin subsets — the browser downloads only
  what the page renders. `index.html` paints a dark shell with a pulse loader, so
  there is no white flash before hydration.
- Scroll reveals use one `IntersectionObserver` per element and disconnect after
  firing; corridor cards are `React.memo`’d. The hidden state is applied only once
  `index.html` has put a `js` class on `<html>`, so prerendered content is readable
  with the bundle blocked or absent — a reveal that never fires must not be a
  paragraph nobody can read.

## Accessibility

- Every text token clears **4.5:1** on *every* surface that carries text —
  `night`, `night-900`, `night-850` and `night-800`. Quoting the worst case
  (against `night-800`, the lightest of the four): ivory 15.5:1, mist 7.9:1,
  mist‑dim 5.7:1, mist‑faint 4.6:1, marigold 8.1:1, jade 7.4:1, lagoon 6.8:1,
  clay 6.3:1, ember 4.9:1. Placeholders are included, because a placeholder is
  text a traveller has to read. The full audit is a comment next to the tokens in
  `src/index.css`; `night-750` and `night-700` are hover states and non-text
  fills (seat dots, meter tracks), which is why they are not in it.
- Skip link, landmark regions, `aria-current` on nav, `aria-pressed` on toggles,
  `role="progressbar"` with real values on meters, `role="img"` + label on the
  routing diagram and the allotment map, table `caption`s and row/column headers
  on the compare table, `aria-live="polite"` on the ledger ticker and toasts.
- The hold-seats dialog traps focus, closes on <kbd>Esc</kbd>, restores focus to
  the trigger, and locks background scroll. Forms validate inline with
  `aria-invalid` + `role="alert"`, and submit moves focus to the first invalid
  field.
- `prefers-reduced-motion` disables every animation, transition and the smooth
  scroll, and reveals are shown immediately.
- **Every route is gated by axe-core at WCAG 2.1 AA plus best practice**, run over
  the prerendered documents that actually ship (`npm run audit`, and a CI step). The
  same script asserts what axe cannot know about this app: exactly one `h1` per
  page, no skipped heading level, a skip link that lands on a landmark that exists,
  a canonical URL and `og:url` that match the file they sit in, a meta description
  between 50 and 320 characters, no literal colour in an inline style, no
  `undefined` or `NaN` in the copy, and a sitemap listing exactly the routes the
  router produces. `color-contrast` is the one rule turned off, because jsdom has no
  layout engine to resolve the cascade — contrast is gated by the token audit above
  instead. The gate was checked against deliberately broken
  documents — a stripped `h1`, a route with no file — and fails both.
- Two real bugs it found on the way in: **corridor pages had no `h1` at all** — the
  visible title is a pair of oversized endpoint codes, which are spans, so a
  screen-reader user reached the sections' `h2`s with no page heading above them
  (now an `sr-only` `h1` naming the corridor, date and mode), and `/trips` stepped
  `h1 → h3`, because the shared empty state hardcoded its heading level (now a
  prop, set per call site).
- Phone numbers are masked everywhere they are displayed.

---

## Scripts

```bash
npm run dev        # vite on 0.0.0.0:5173
npm run build      # tsc --noEmit && vite build && prerender all 12 routes
npm run prerender  # the static-HTML step on its own, against an existing dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm run verify     # typecheck + SSR render check (see below)
npm run audit      # axe-core + document assertions over the prerendered HTML
```

Every one of those runs in CI on each pull request and each push to `main`
(`.github/workflows/ci.yml`: nine steps), together with two gates that are easy to
let slip by hand: a **bundle budget** that fails the build if any JS or CSS chunk
passes 260 kB — the same limit `vite.config.ts` only warns at — and a
**no-literal-colour rule** that fails if a hex or `rgba()` value appears anywhere in
`src/**`, because the whole palette is supposed to live in `src/index.css`. The
workflow needs no secrets and no network beyond npm: the render checks read the
bundled snapshot and the accessibility gate reads `dist/`, so CI cannot go red
because the database is unreachable.

`npm run verify` builds `scripts/ssr-check.tsx` for Node and renders the whole
tree — every view, every corridor detail page, empty states, unknown codes,
offline mode, the 404 — with no DOM and no effects. It asserts that all eight
corridor codes appear, that no `NaN` or bare `undefined` reaches the reader, that
the public feed never carries a phone number, and that every snapshot row is
internally consistent (tier thresholds ascending, tier fares descending, surge
above Tier I, coordinates and refund rules present). It also checks the heading
outline of every view including the states a prerender never shows, that each
route's title and description are shaped for a search result, and that the board
renders byte-identically twice. **87 checks**; a non-zero exit fails the build. It
has caught three real bugs on its own; the heading-outline and route-metadata
checks were added after the prerender pass turned up a doubled `×` in a corridor's
meta description and two pages whose outline skipped a heading level.

---

## Environment

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Ledger URL (defaults to `https://txbgovhxqxvlioszevbe.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Publishable anon key |

Both are set on the Vercel project. The anon key is *meant* to be public — the
security boundary is RLS plus the definer functions above, not the key.

---

## Known limitations (stated, not hidden)

- **No payments, no ticketing licence.** Air ticketing needs IATA/TASF
  accreditation and pooling traveller money needs an RBI-compliant nodal or
  escrow arrangement. Neither exists here; the escrow language describes the
  intended flow.
- **Inventory is not owned.** A carrier can withdraw a block. When that happens
  the corridor closes and pledges release — which is exactly why the fee cannot
  carry the company alone (₹344/seat on the flagship block).
- **`utsav_carrier_bids` accepts anonymous inserts.** The carrier desk form needs
  it; a real deployment would put that write behind an authenticated role. The same
  is true of pledge writes, which is why their rate limit is per-device rather than
  per-identity.
- **`utsav_upvote_request` has no rate limit.** An upvote is a blind increment and
  the table records no device, so throttling it per traveller would need a new
  ledger of who voted for what. Stated rather than silently left open.
- **Prerendered documents carry the build-time snapshot** until hydration replaces
  it with live rows — a few hundred milliseconds for a traveller, longer for a
  crawler that never runs the bundle. Seat counts in shared HTML are therefore as
  fresh as the last deploy, not the last pledge.
- **The fee allocation percentages are indicative**, published so they can be
  argued with, not audited figures.
- **Passenger names appear in the public feed.** Deliberate social proof for the
  prototype; production would need an explicit consent flag per pledge.
