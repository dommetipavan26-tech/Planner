# 2. Every ledger write goes through a SECURITY DEFINER function

Status: accepted · 2026-11 · contract half pending deploy (migration 0008)

## Context

The publishable anon key ships in every browser. With row-level security alone,
"who may write" is expressed as policies over the row being written, and the
first version of this board had the holes that shape produces: an anonymous
INSERT policy on the bid table let any caller write a bid already marked
`accepted` in any carrier's name — which the public board renders as a
confirmed block — and an anonymous INSERT on the request table let anyone
manufacture demand with an arbitrary `upvotes` value. A desk contact email sat
in a world-readable column while the form promised it was not published.

## Decision

Tables are readable where they are public by nature and writable by nobody.
Every write is a `SECURITY DEFINER` function with `SET search_path = public`,
`EXECUTE` granted to `anon` and `authenticated`, and the function — not the
caller — supplies identity:

- `utsav_join_cohort` derives the device from an argument it throttles on, and
  holds `FOR UPDATE` on the corridor row so two simultaneous joins cannot both
  see the same seat.
- `utsav_carrier_desk_signin` returns a session token; `utsav_submit_bid`
  derives carrier identity from that token, so a bid can only be written in the
  name of the desk that signed in.
- `utsav_upvote_request(uuid, uuid)` records one vote per (request, device) in
  a table with zero policies, so a loop cannot re-order the request board.

The removals land after the clients that need the old paths are gone:
migration 0005 added the new surface without deleting anything, and migration
0008 — expand, deploy, contract — drops the two anonymous INSERT policies, the
`desk_contact` column and the unbounded one-argument upvote overload. Until
0008 runs against production the old paths still exist by design.

## Consequences

- The anon key is a read key with a handful of rate-limited, validated
  procedures attached; it can no longer name a carrier or set a status.
- Validation lives in one place per write, in SQL, next to the constraint it
  protects; the client's job is to render refusals, not to enforce them.
- pgcrypto lives in schema `extensions`, so definers with a pinned search path
  must call `extensions.crypt()` qualified. Unqualified calls fail with 42883
  and widening the search path is not the fix.
- Every write path needs a probe: a multi-statement `BEGIN … ROLLBACK` block
  with a temp observation table is how each behaviour above was checked
  without leaving rows behind.
