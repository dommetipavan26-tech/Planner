# UtsavAir — Festival Bulk Corridor Desk

A festival travel marketplace that pools travelers on high-surge Indian corridors and clears them
against **airline group desks** and **chartered coach fleets** at contracted net fares — so a family
flying Vijayawada → Delhi for Sankranti pays a wholesale slab instead of a 2.7× retail surge bucket.

```
Festival retail  ₹14,850   ── what an OTA charges on 12 Jan
Tier I   (15)    ₹ 9,299   ── contracted net fare + 4.5% platform fee
Tier II  (30)    ₹ 7,995
Tier III (45)    ₹ 7,106   ── deepest slab, unlocked by the cohort
```

Every tier, fee and deadline is published on the corridor row. The platform keeps a disclosed
coordination fee (4.5% air / 4.0% coach) plus a carrier override — printed on each receipt.

## Live stack

| Layer | What runs |
| --- | --- |
| **Supabase** | Postgres 17 (`txbgovhxqxvlioszevbe`, ap-south-1). Tables `utsav_corridors`, `utsav_pledges`, `utsav_carrier_bids`, `utsav_corridor_requests`, all four in the `supabase_realtime` publication. RLS enabled on every table. |
| **Postgres logic** | `public.utsav_join_cohort()` — `SECURITY DEFINER` transaction that row-locks the corridor, validates seats against remaining allotment, resolves the tier slab, derives the fee and savings, and writes the pledge receipt. `public.utsav_upvote_request()` for demand signals. |
| **Client** | React 19 + TypeScript + Vite + Tailwind v4. One `useCorridorDesk` hook owns the four queries and a single Realtime channel; falls back to a bundled snapshot (labelled `SNAPSHOT`) if Postgres is unreachable. |
| **Vercel** | Project `utsav-corridor` (team `pavan-4ae5`), linked to this repo, Vite preset, output `dist`, env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_LINEAR_TEAM_KEY`. |
| **Linear** | Team `PAV`, project *UtsavAir — Festival Bulk Corridor Desk*, 4 milestones, issues PAV-12 → PAV-21, plus a pinned architecture & risk memo. |

## Views

- **Corridor board** — editorial hero, live departure-board panel, filterable corridor ledger, surge
  spread chart, streaming pledge receipts, operating model.
- **Allotment desk** — carrier-side bid ledger and intake form, block GMV and booked fee, plus why a
  carrier says yes.
- **Demand board** — route requests with upvotes and viability tiers, corridor intake form.
- **Idea review** — weighted founder score across 8 dimensions, score polygon, strengths, an 8-item
  risk register with mitigations, money-movement map, and an interactive corridor unit-economics model.
- **Delivery** — the live stack and the Linear roadmap mirrored issue by issue.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit && vite build → dist/
```

Environment (optional — sane defaults are compiled in for this prototype):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
VITE_LINEAR_TEAM_KEY=PAV
```

## Schema

See `supabase/migrations/utsav_corridor_schema_and_seed.sql` for the full migration: tables, tier
slab columns, both RPCs, RLS policies and the realtime publication.

## Honest status

This is a working prototype with a real database, real transactions and real realtime — but the
corridor contracts, carrier bids and cohort pledges are **seeded demonstration data**. No inventory
is sold and no payment is captured. Before taking a rupee from a traveler you need (1) an
RBI-compliant nodal/escrow partner and (2) an IATA or TASF answer on ticketing. Both are tracked in
Linear (PAV-16, PAV-20).
