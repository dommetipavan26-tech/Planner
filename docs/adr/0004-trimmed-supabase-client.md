# 4. PostgREST and Realtime clients directly, not the supabase-js umbrella

Status: accepted · 2026-11

## Context

`@supabase/supabase-js` bundles Auth, Storage, Functions and Edge Functions
client code around the two clients this app actually uses. The board has no
Auth session (desk sign-in is ADR-3 over an RPC), no Storage, no Functions
client — every call is `rpc()` or a channel subscription. The umbrella's bundle
cost landed in the ledger chunk, which is the chunk every route waits for
after first paint, and its lockfile tree carried advisories the app could not
fix without upgrading packages it does not use.

## Decision

`src/lib/supabase.ts` constructs `PostgrestClient` and `RealtimeClient` from
`@supabase/postgrest-js` and `@supabase/realtime-js` at the same versions the
umbrella pins, and reproduces the three behaviours the umbrella was providing
for free: the `apikey` and `Authorization: Bearer` headers on every REST call,
the `apikey` parameter on the realtime connection, and the `rest/v1` /
`realtime/v1` URL derivation. Both clients are created lazily on first use so
the prerender never touches them.

## Consequences

- The ledger chunk went from 226.47 kB raw / 59.57 kB gzipped to 78.27 kB /
  23.05 kB, and the lockfile returned to zero advisories in both scopes.
- Parity with the umbrella is a claim we checked once, by hand: a local
  PostgREST stub received byte-identical requests from both clients except for
  the `x-client-info` telemetry string the umbrella adds and we do not miss.
  `RealtimeClient` does not expose its parameters or headers after
  construction, so realtime parity is argued from the constructor call, not
  measured — say so whenever this is revisited.
- Upgrading means tracking two packages instead of one umbrella, and reading
  the umbrella's release notes for the two it wraps.
