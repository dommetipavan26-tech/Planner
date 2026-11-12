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

Deep links work in production (`vercel.json` rewrites every path to
`index.html`). Unknown corridor codes and unknown paths both degrade to a useful
page rather than a blank one.

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

```
src/
  lib/        types · format (all money/date/corridor maths) · supabase · device · router · normalise
  hooks/      useLedger (queries, realtime, mutations) · useClock · useAnimatedNumber
  data/       snapshot.ts — mirror of the production ledger for offline/first paint
  components/ ui · icons · AppShell · CorridorCard · NetworkMap · Pricing · JoinSheet · Explainers · ErrorBoundary
  views/      Corridors · Corridor · Trips · Carriers · Requests · NotFound
scripts/      ssr-check.tsx — the render check behind `npm run verify`
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
| `utsav_join_cohort(corridor, name, phone, cohort, boarding_point, seats, device_id)` | Row-locks the corridor, validates seats 1–8 / name ≥3 chars / 10-digit mobile, refuses to oversell the allotment, recomputes the slab and status, writes the receipt |
| `utsav_public_pledges(limit)` | Public activity feed — projected **without** phone numbers, boarding points and device ids |
| `utsav_my_pledges(device_id)` | Owner-scoped full rows |
| `utsav_my_watches` / `utsav_watch_corridor` / `utsav_unwatch_corridor` | Device-scoped watch list |
| `utsav_upvote_request(request_id)` | The only way an upvote moves |

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
`utsav_privacy_hardening_v2_1`) so the schema can be read and rebuilt from
source. **Do not re-apply them to the live project.**

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
- **Chunking:** `react` 221.70 kB / 68.96 gzip · app 198.15 kB / 52.61 gzip ·
  `ledger` 226.47 kB / 59.57 gzip (on demand) · CSS 53.46 kB / 10.46 gzip.
  Nothing exceeds the 260 kB warning limit.
- **Two clocks.** A 1 Hz tick is right for a countdown and wrong for a grid of
  cards, so `useNow()` is consumed only by small leaf components (`<Countdown>`,
  `<ClockStamp>`) while cards and lists read a 30 s `useCoarseNow()`. A board of
  eight live countdowns costs eight leaf re-renders a second, not eight cards.
- **Fonts** are unicode-ranged variable/latin subsets — the browser downloads only
  what the page renders. `index.html` paints a dark shell with a pulse loader, so
  there is no white flash before hydration.
- Scroll reveals use one `IntersectionObserver` per element and disconnect after
  firing; corridor cards are `React.memo`’d.

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
- Phone numbers are masked everywhere they are displayed.

---

## Scripts

```bash
npm run dev        # vite on 0.0.0.0:5173
npm run build      # tsc --noEmit && vite build
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm run verify     # typecheck + SSR render check (see below)
```

All five of those steps run in CI on every pull request and every push to `main`
(`.github/workflows/ci.yml`), together with two gates that are easy to let slip by
hand: a **bundle budget** that fails the build if any JS or CSS chunk passes
260 kB — the same limit `vite.config.ts` only warns at — and a **no-literal-colour
rule** that fails if a hex or `rgba()` value appears anywhere in `src/**`, because
the whole palette is supposed to live in `src/index.css`. The workflow needs no
secrets and no network beyond npm: the render checks read the bundled snapshot, so
CI cannot go red because the database is unreachable.

`npm run verify` builds `scripts/ssr-check.tsx` for Node and renders the whole
tree — every view, every corridor detail page, empty states, unknown codes,
offline mode, the 404 — with no DOM and no effects. It asserts that all eight
corridor codes appear, that no `NaN` or bare `undefined` reaches the reader, that
the public feed never carries a phone number, and that every snapshot row is
internally consistent (tier thresholds ascending, tier fares descending, surge
above Tier I, coordinates and refund rules present). 50 checks; a non-zero exit
fails the build. It has already caught three real bugs.

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
  it; a real deployment would put that write behind an authenticated role.
- **The fee allocation percentages are indicative**, published so they can be
  argued with, not audited figures.
- **Passenger names appear in the public feed.** Deliberate social proof for the
  prototype; production would need an explicit consent flag per pledge.
