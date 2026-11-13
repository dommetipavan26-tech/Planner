# UtsavAir — festival corridor desk

[![CI](https://github.com/dommetipavan26-tech/Planner/actions/workflows/ci.yml/badge.svg)](https://github.com/dommetipavan26-tech/Planner/actions/workflows/ci.yml)

Pooled group allotment for the routes that surge hardest during Indian festival
travel. A carrier contracts a block of seats for one departure; travellers pledge
into it; the moment the cohort crosses a threshold, **every** pledged seat
reprices down to the contracted slab — including the seats that joined first.
Carrier desks sign in to lodge and manage the bids behind those blocks.

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
| **Carrier desk** | A supply-side sign-in — desk code plus passcode — that lets a carrier lodge bids against corridors and see only its own. |

That table is the contract vocabulary, and it is the only place the product uses
it. To a traveller the same facts arrive as seats and rupees — *Pledges open*,
*Second fare cut*, *12 seats to ₹7,800*, *Nothing is charged until 15 seats are
pledged* — because "Tier II locked" asks a first-time reader to already know what
a tier is ([ADR‑0008](docs/adr/0008-light-identity-and-clarity-over-atmosphere.md)).

Eight corridors are live. **Six air blocks** — two out of Vijayawada (the
Sankranti flagship on AI‑460 and the Kartika Purnima / winter-wedding-peak block),
one inbound Delhi→Vijayawada, and one each from Visakhapatnam, Rajahmundry and
Tirupati — plus **two coach blocks**, Bengaluru→Guntur and Hyderabad→Vijayawada.
Festival surge fares across them run **2.48×–3.78×** the off-season fare
(`surgeMultiple()` on every row; the coach blocks surge hardest because a berth on
the night of Sankranti is the one thing nobody will discount).

### Trying the carrier desk

The demo desk is published on purpose — reviewers need a way in:

| Desk code | Passcode |
|---|---|
| `AI-SOUTH` | `MELAM-AI-2027` |

Sign in from **/carriers** (or from a corridor page's bid card). A session is a
64‑hex token held in `sessionStorage` for eight hours — per tab, so closing the
tab signs the desk out — and every bid written under it carries the carrier's
identity from the session, never from the form. Five wrong passcodes lock the
desk for fifteen minutes. The other two desks exist with random passcodes that
are hashed at migration time and never displayed, which is how operations would
provision a real one.

---

## Routes

| Path | View |
|---|---|
| `/` | Live board: routing diagram, desk totals, filterable corridor grid or compare table, pledge feed, mechanics, tier slabs, fee disclosure, refund rules |
| `/corridor/:code` | One corridor: price anatomy, tier ladder, allotment map, operations, cohort, the carrier bid behind the block, sticky pledge rail |
| `/trips` | Your pledges and watched corridors, read back from Postgres by device id |
| `/carriers` | Supply side: every bid logged against a corridor, the gated desk sign-in, and the bid sheet it unlocks |
| `/requests` | Demand side: request a corridor, upvote one, and the threshold policy that turns a request into a contracted block |

**Every one of those paths is prerendered to static HTML at build time** — 12
documents: the board, one per corridor code (eight), carriers, requests and trips
([ADR‑0001](docs/adr/0001-prerendered-documents-over-an-ssr-server.md)). So a deep
link is a document, not a promise: a crawler, a link preview in a family group
chat, and a traveller whose connection drops before the bundle arrives all get
the real corridor, its tier ladder and its fare. Unmatched paths rewrite to
`index.html`, which is how an unknown code or a typo degrades to a useful page
instead of a blank one.

`/trips` is device-scoped, so its document is the empty state every first-time
visitor sees; a returning traveller's pledges arrive the moment the ledger
answers, as they always have.

Corridor pages also carry each endpoint's name in **Telugu** under the English
label, `lang="te"` for screen readers — a client-side dictionary, not a column,
for the reasons in
[ADR‑0005](docs/adr/0005-telugu-as-a-presentation-dictionary.md).

---

## Stack

- **Vite 7 + React 19 + TypeScript** (`strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, `noUnusedLocals/Parameters`).
- **Tailwind CSS 4** with a hand-authored `@theme` design system in
  `src/index.css`. **No component carries a literal colour** — not in a class, not
  in an inline style, not in an SVG attribute. Every hue, radius, easing curve and
  shadow is a token; glows and shadows are `color-mix()`ed from the palette rather
  than restated as `rgba()`, so changing `--color-accent` recolours the button
  glow, the focus ring and the chart arcs together. The identity is a light one —
  warm paper, ink type, one marigold stamp — and its tokens are named for the job
  they do (`page`, `surface`, `ink`, `rule`) rather than for the pigment they
  happen to be, so a theme is a change of values and not of meaning
  ([ADR‑0008](docs/adr/0008-light-identity-and-clarity-over-atmosphere.md)).
- **Supabase Postgres** as the ledger: tables, RLS, `SECURITY DEFINER` functions
  and Realtime. No backend of our own — and no `@supabase/supabase-js`: the app
  talks to PostgREST and Realtime directly through the two clients it actually
  uses ([ADR‑0004](docs/adr/0004-trimmed-supabase-client.md)).
- **No router dependency.** `src/lib/router.tsx` is ~130 lines: path matching,
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
- **Installable, not offline.** A web manifest and generated raster icons put the
  desk on a home screen; there is deliberately no service worker, because a cache
  in front of this ledger could serve a stale seat count
  ([ADR‑0007](docs/adr/0007-installable-not-offline.md)).

```
src/
  lib/        types · format (all money/date/corridor maths) · supabase · device ·
              router · normalise · meta · buildTime · telemetry · telugu
  hooks/      useLedger (queries, realtime, mutations, desk session) · useClock ·
              useAnimatedNumber
  data/       snapshot.ts — mirror of the production ledger for offline/first paint
  components/ ui · icons · AppShell · CorridorCard · NetworkMap · Pricing ·
              JoinSheet · Explainers · ErrorBoundary
  views/      Corridors · Corridor · Trips · Carriers · Requests · NotFound
scripts/      ssr-check.tsx — the render check behind `npm run verify`
              prerender.tsx — writes all 12 routes to static HTML in dist/
              dom-check.tsx — axe-core plus document assertions behind `npm run audit`
              make-icons.mjs — rasterises the manifest icons from the favicon path
tests/        Playwright browser suite: documents, ledger behaviour, axe in a real browser
supabase/     config.toml + seed.sql for a local stack, numbered migration mirrors
docs/adr/     the decisions this file keeps citing
```

**One rule the codebase keeps:** no component does arithmetic. Every rupee,
percentage, countdown, tier and saving is derived in `src/lib/format.ts`, and
every row arriving from PostgREST passes through `src/lib/normalise.ts` (which
coerces `numeric` strings and nulls) before anything renders it.

---

## Data & security

Nine tables, all RLS-enabled. The five board tables sit in the
`supabase_realtime` publication; the four desk and vote tables do not, and three
of them carry **zero policies** — they are reachable only through the functions
below.

| Table | anon SELECT | anon INSERT | anon UPDATE |
|---|---|---|---|
| `utsav_corridors` | ✅ | — | — |
| `utsav_carrier_bids` | ✅ | — | — |
| `utsav_corridor_requests` | ✅ | — | — |
| `utsav_pledges` | **none** | **none** | — |
| `utsav_corridor_watches` | **none** | **none** | — |
| `utsav_carriers` | **none** | **none** | **none** |
| `utsav_carrier_desk_sessions` | **none** | **none** | **none** |
| `utsav_request_votes` | **none** | **none** | **none** |
| `utsav_request_receipts` | **none** | **none** | **none** |

The publishable anon key ships to the browser by design, so the interesting
question is what it can reach. **Every write is a `SECURITY DEFINER` function**
([ADR‑0002](docs/adr/0002-writes-through-definer-functions.md)); the tables
themselves have no anonymous write path:

| Function | Purpose |
|---|---|
| `utsav_join_cohort(corridor, name, phone, cohort, boarding_point, seats, device_id)` | Row-locks the corridor, validates seats 1–8 / name ≥3 chars / 10-digit mobile, refuses to oversell the allotment, recomputes the slab and status, writes the receipt. **Idempotent and rate-limited** — see below |
| `utsav_public_pledges(limit)` | Public activity feed — projected **without** phone numbers, boarding points and device ids |
| `utsav_my_pledges(device_id)` / `utsav_my_watches(device_id)` | Owner-scoped full rows |
| `utsav_watch_corridor` / `utsav_unwatch_corridor` | Device-scoped watch list |
| `utsav_submit_request(…)` | Writes a corridor request plus its first vote and receipt; identical retries return the same row |
| `utsav_upvote_request(request_id, device_id)` | One vote per (request, device), recorded in a zero-policy table; a repeat returns `already_voted` and moves nothing |
| `utsav_carrier_desk_signin(desk_code, passcode, device_id)` | Returns `{ ok, session_token, expires_at, … }` — or `{ ok: false, code, error }` with the *same* sentence for a wrong passcode and an unknown desk ([ADR‑0003](docs/adr/0003-refusals-as-data.md)). Counts failures; five locks the desk for 15 minutes |
| `utsav_carrier_session(token)` / `utsav_carrier_signout(token)` | Restore and end a desk session |
| `utsav_submit_bid(token, …)` | Writes carrier identity from the session, status `under_review`, and never publishes the desk's contact address |

**A pledge write is idempotent, and it has a pace limit.** The same device asking
for the same corridor, the same seat count and the same lead passenger within two
minutes is a retry — a double-tapped button, or a second attempt after a response
that never arrived — so the function returns the pledge it already wrote instead
of writing another one. Beyond that, one device gets a pledge every five seconds
and can hold twelve live ones; both refusals return SQLSTATE `UT429`, which the
client maps to "give it a few seconds" rather than to a fake local receipt (a
throttled write did not happen, so there is nothing to mirror).

That limit is honest about its own reach: `device_id` is minted in the browser, so
anyone can make more of them. It stops accidents and casual hammering, not a
determined abuser. The oversell guarantee is separate and older, and it does hold:
the corridor row is locked `FOR UPDATE` first, so concurrent joins serialise and
cannot take a block past `total_allotment`. All of these behaviours were tested
against the live function inside rolled-back transactions.

Three consequences worth knowing:

1. **Realtime pledge payloads never reach an anonymous subscriber** (RLS withholds
   them). The app treats a corridor `UPDATE` as the pledge signal — every pledge
   write moves `pledged_seats` and `allotment_status` — and re-reads the feed
   through its projection.
2. **The device id is a capability, not an identity.** It is a random UUID in
   `localStorage`; `utsav_my_pledges` will return rows for whatever UUID you hand
   it. Unguessable, and honest about being a prototype stand-in for auth.
3. **Telemetry is redacted before it leaves the browser.** Product events —
   ledger offline, a throttled or refused write, an uncaught render error — go
   through `src/lib/telemetry.ts`, which replaces emails, uuids, session-token
   hex, booking references and phone numbers with `[email]`, `[id]`, `[token]`,
   `[ref]`, `[digits]` before queueing
   ([ADR‑0006](docs/adr/0006-telemetry-redaction.md)). The render check asserts
   every rule.

Migration history lives in Supabase; `supabase/migrations/` holds **numbered
mirrors in the order they were applied** — `0001` schema and seed through `0007`,
plus `0008_utsav_carrier_desk_contract_v2_4`, the contract half that drops the
legacy anonymous INSERT policies, the public `desk_contact` column and the
unbounded one-argument upvote overload once the client that no longer needs them
is live. **Do not re-apply any of them to the live project.** With
`supabase/config.toml` and `supabase/seed.sql` in place, `supabase db reset`
rebuilds an equivalent database locally: the seed travels inside `0001` and
`0005` because the demo board *is* the seed, and `seed.sql` only re-asserts the
published demo passcode.

---

## Performance

- **Snapshot-first paint.** `src/data/snapshot.ts` is a mirror of the production
  ledger, so the board renders complete on the first frame — no spinner, no layout
  shift, no empty state while Postgres answers. When live rows land, numbers tween
  into place and the status pill flips from *Connecting* to *Live ledger*. If
  Postgres is unreachable the desk keeps working and says so (banner + *Snapshot*
  pill + a note on any receipt written locally).
- **The ledger client is lazy and trimmed** — 78.27 kB raw / 23.05 kB gzip, down
  from 226.47 / 59.57 when the umbrella SDK was on the path — and therefore off
  the critical path: first paint never waits for it.
- **Chunking,** after route splitting: `react` 221.70 kB / 68.96 gzip · app
  150.68 kB / 43.97 gzip · CSS 55.61 kB / 10.75 gzip · five view chunks that
  arrive only for the route being visited · `ledger` on demand · `insights`
  6.50 kB / 2.29 gzip, mounted after the route is interactive. Nothing exceeds the
  260 kB budget CI enforces.
- **Prerendered documents.** All 12 routes ship as static HTML (15.6–136.7 kB each),
  so the first thing a traveller sees on a deep link is the corridor, not a
  skeleton. `main.tsx` hydrates that markup only when the document was rendered
  for the path being requested; otherwise it renders fresh. Everything the two
  renders could disagree about — the clock, the footer year, a device id from
  `localStorage` — starts from one injected build instant (`PRERENDERED_AT`) and
  corrects itself in a layout effect before paint. `npm run verify` asserts the
  board renders byte-identically twice, which is what keeps that true.
- **Metrics are lazy, and they still measure the real page.** `@vercel/analytics`
  and `@vercel/speed-insights` read *buffered* `PerformanceObserver` entries, so
  mounting them after hydration does not lose the navigation they are there to
  record — and they stay out of the framework chunk (`vite.config.ts` buckets
  vendor code by package name at the `node_modules/` boundary, because a substring
  match on `/react/` also matched `@vercel/analytics/react/` and quietly pulled
  instrumentation into React). Product events fire through `src/lib/telemetry.ts`,
  which keeps its own queue because the collector drops events fired before its
  script loads.
- **Two clocks.** A 1 Hz tick is right for a countdown and wrong for a grid of
  cards, so `useNow()` is consumed only by small leaf components (`<Countdown>`,
  `<ClockStamp>`) while cards and lists read a 30 s `useCoarseNow()`. A board of
  eight live countdowns costs eight leaf re-renders a second, not eight cards.
- **Fonts** are unicode-ranged variable/latin subsets — the browser downloads only
  what the page renders. Telugu names deliberately use the platform's own Telugu
  face rather than a 36 kB webfont subset (ADR‑0005). One family does the whole
  board: Geist Variable for text and headings, Geist Mono for codes, clocks and
  rupees, and no serif display face, so two font files left with it (ADR‑0008).
  `index.html` paints the paper shell with a pulse loader, so there is no flash of
  the wrong background before hydration — and it mirrors four tokens *by value* to
  do it, which is noted in the file itself.
- Scroll reveals use one `IntersectionObserver` per element and disconnect after
  firing; corridor cards are `React.memo`'d. The hidden state is applied only once
  `index.html` has put a `js` class on `<html>`, so prerendered content is readable
  with the bundle blocked or absent — a reveal that never fires must not be a
  paragraph nobody can read.

## Accessibility

- Every text token clears **4.5:1** on *every* surface that carries text —
  `page`, `surface`, `raised`, `sunken` and all six tints. Each number below is
  that token's **worst case** across the whole set, which lands on
  `clay-tint-strong` every time: ink 13.84:1, ink‑soft 8.52:1, ink‑muted 5.95:1,
  ink‑faint 4.72:1, accent‑deep 5.03:1, accent‑ink 6.72:1, jade‑deep 5.68:1,
  ember‑deep 5.78:1, lagoon‑deep 6.30:1, clay‑deep 5.86:1, on‑accent 14.30:1.
  Placeholders are included, because a placeholder is text a traveller has to
  read. The audit is a comment next to the tokens in `src/index.css`, and
  `npm run tokens` re-derives the pairs from the source on every run.
- Skip link, landmark regions, `aria-current` on nav, `aria-pressed` on toggles,
  `role="progressbar"` with real values on meters, `role="img"` + label on the
  routing diagram and the allotment map, table `caption`s and row/column headers
  on the compare table, `aria-live="polite"` on the ledger ticker and toasts.
- The hold-seats dialog and the desk sign-in sheet trap focus, close on
  <kbd>Esc</kbd>, restore focus to the trigger, and lock background scroll. Forms
  validate inline with `aria-invalid` + `role="alert"`, and submit moves focus to
  the first invalid field.
- `prefers-reduced-motion` disables every animation, transition and the smooth
  scroll, and reveals are shown immediately.
- **Marigold is a fill or a deep cut, never a bright foreground.** On paper the
  bright accent is 1.96:1 against the page — decoration, not a label — so the
  token set has no `text-accent` at all: an accent-coloured word takes
  `accent-deep` or `accent-ink`, and the bright hue only ever appears as a
  background with near-black `on-accent` type on it (8.53:1).
- **Every route is gated by axe-core at WCAG 2.1 AA plus best practice**, run over
  the prerendered documents that actually ship (`npm run audit`, and a CI step).
  The same script asserts what axe cannot know about this app: exactly one `h1`
  per page, no skipped heading level, a skip link that lands on a landmark that
  exists, a canonical URL and `og:url` that match the file they sit in, a meta
  description between 50 and 320 characters, a manifest whose icons all exist in
  `dist/`, no literal colour in an inline style, no `undefined` or `NaN` in the
  copy, and a sitemap listing exactly the routes the router produces.
  `color-contrast` is the one rule turned off *there*, because jsdom has no layout
  engine to resolve the cascade — the Playwright suite runs axe again **in a real
  browser**, where `color-contrast` does run, over every route and the open
  sign-in sheet.
- Two real bugs the document gate found on the way in: **corridor pages had no
  `h1` at all** — the visible title is a pair of oversized endpoint codes, which
  are spans, so a screen-reader user reached the sections' `h2`s with no page
  heading above them (now an `sr-only` `h1` naming the corridor, date and mode),
  and `/trips` stepped `h1 → h3`, because the shared empty state hardcoded its
  heading level (now a prop, set per call site).
- Phone numbers are masked everywhere they are displayed.

---

## Testing and CI

```bash
npm run dev        # vite on 0.0.0.0:5173
npm run build      # tsc --noEmit && vite build && prerender all 12 routes
npm run prerender  # the static-HTML step on its own, against an existing dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm run verify     # typecheck + SSR render check (107 checks)
npm run audit      # axe-core + document assertions over the prerendered HTML
npm run test:browser        # the Playwright suite (35 tests, chromium)
npm run test:browser:install# fetches the browser binaries first
npm run lighthouse # Lighthouse CI budgets over dist/
npm run icons      # regenerate the manifest icons from the favicon path
```

`.github/workflows/ci.yml` runs two jobs on every pull request and push to
`main`. **`verify`** is the fast, offline half: typecheck, the render check, the
**token gate** (`npm run tokens`, which runs first inside the document gate: every
palette utility in `src/**` resolves to a defined token, and every background and
foreground that share a class string clear 4.5:1), the document gate, the build, a
**bundle budget** that fails if any JS or CSS chunk passes 260 kB, the
**no-literal-colour grep** over `src/**`, and a **dependency audit** that fails the build on any high advisory in the production tree
(`npm audit --omit=dev --audit-level=high`). **`browser`** is the slow half:
`npm ci`, Playwright's chromium, the build, the 35-test browser suite, and
Lighthouse CI against `dist/` with budgets for accessibility (≥0.95), best
practices (≥0.90), performance (≥0.80), CLS, FCP, LCP and total byte weight. Both
report bundles are uploaded as an artifact on every run, cancelled or not.

The browser suite **never writes to the production ledger**: every test either
cuts the network to Supabase and works from the snapshot, or stubs the REST and
RPC endpoints with fixtures. What it covers instead is what jsdom cannot — that
each of the twelve documents hydrates its own prerendered markup, that an
extensionless URL falls back to the board and repaints, that client-side
navigation keeps one `h1` and one `main`, that the desk gate refuses a signed-out
bid, renders a `UT429` lockout and a `UT401` without leaking the passcode into
telemetry, that a signed-in bid submits against the stub, and that axe's
`color-contrast` rule runs in a real engine: zero violations, and the only
contrast axe may leave unresolved is text over the two decorative washes the
heroes declare in `src/index.css` (`.glow-accent` and `.grid-veil`), which are
sibling layers behind the content and therefore invisible to any ancestor walk.
A translucent layer added anywhere else fails the build.

`npm run verify` builds `scripts/ssr-check.tsx` for Node and renders the whole
tree — every view, every corridor detail page, empty states, unknown codes,
offline mode, the 404 — with no DOM and no effects. It asserts that all eight
corridor codes appear, that no `NaN` or bare `undefined` reaches the reader, that
the public feed never carries a phone number, that every snapshot row is
internally consistent, that every city on the board has a Telugu name and that a
half-known one renders as nothing, and that each redaction rule in
`src/lib/telemetry.ts` holds against a realistic string. **107 checks**; a
non-zero exit fails the build.

The gates were checked against deliberately broken documents — a stripped `h1`,
a route with no file, a sabotaged assertion — and fail loudly every time.

---

## Decisions, written down

`docs/adr/` holds the ones that would otherwise live in commit messages:

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-prerendered-documents-over-an-ssr-server.md) | Prerendered documents at build time, not a server at request time |
| [0002](docs/adr/0002-writes-through-definer-functions.md) | Every ledger write goes through a `SECURITY DEFINER` function |
| [0003](docs/adr/0003-refusals-as-data.md) | A refused RPC returns a refusal; it does not raise |
| [0004](docs/adr/0004-trimmed-supabase-client.md) | PostgREST and Realtime clients directly, not the supabase-js umbrella |
| [0005](docs/adr/0005-telugu-as-a-presentation-dictionary.md) | Telugu place names are a render-time dictionary, not a column |
| [0006](docs/adr/0006-telemetry-redaction.md) | Telemetry is redacted in the browser, before the queue |
| [0007](docs/adr/0007-installable-not-offline.md) | Installable, but deliberately not offline |
| [0008](docs/adr/0008-light-identity-and-clarity-over-atmosphere.md) | A light departure-board identity, and clarity over atmosphere |

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
- **Writes are rate-limited per device, not per identity.** Device ids are minted
  in the browser, so the throttle stops accidents and casual hammering rather
  than a determined abuser; closing that properly means real authentication,
  which the prototype substitutes with unguessable UUIDs and, for desks,
  passcode sessions.
- **A desk session lives in `sessionStorage`.** Closing the tab signs the desk
  out. That is deliberate for a shared-queue environment, and inconvenient on a
  phone that closes tabs aggressively.
- **Prerendered documents carry the build-time snapshot** until hydration replaces
  it with live rows — a few hundred milliseconds for a traveller, longer for a
  crawler that never runs the bundle. Seat counts in shared HTML are therefore as
  fresh as the last deploy, not the last pledge.
- **No service worker**, by decision (ADR‑0007): re-opens are not instant, and a
  traveller in a tunnel sees the labelled snapshot rather than a warm cache that
  could lie about seats.
- **Telugu coverage is a dictionary** (ADR‑0005): a city added to the board
  without a Telugu row fails `npm run verify` until someone writes it.
- **The fee allocation percentages are indicative**, published so they can be
  argued with, not audited figures.
- **Passenger names appear in the public feed.** Deliberate social proof for the
  prototype; production would need an explicit consent flag per pledge.
