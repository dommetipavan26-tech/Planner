# 3. A refused RPC returns a refusal; it does not raise

Status: accepted · 2026-11

## Context

One PostgREST call is one transaction. The desk sign-in function needs to count
failed attempts and lock a desk on the fifth — but a `RAISE` on the fifth
attempt rolls back the very row that recorded it, so the counter never
persists and the lockout is unreachable. The same shape applies anywhere a
refusal has to leave evidence behind: a throttle window, a duplicate receipt,
a vote that already happened.

## Decision

Functions that can refuse return `{ ok, code, error, … }` and reserve `RAISE`
for programmer errors and constraint violations the caller cannot cause by
behaving normally (`22023` for a seat count outside its domain, for instance).
Refusal codes are SQLSTATEs of our own: `UT401` unauthenticated or bad
credentials, `UT429` throttled or locked. The client branches on `data.ok`,
never on `error`, for those calls — `src/lib/supabase.ts` exposes
`isAuthError` / `isThrottleError` over the codes, and the UI renders the
message the function returned.

Consequences that fall out: identical refusals must be indistinguishable where
distinguishability would leak (wrong passcode and unknown desk code return the
same sentence), and a refusal's side effects — the incremented counter, the
lock timestamp — persist because the transaction commits.

## Consequences

- Lockout became reachable and provable: five wrong attempts persist
  `failed_attempts` 1→4 and the fifth returns `UT429` with `locked_until`.
- Callers must remember which calls speak this dialect. `useLedger` wraps them
  in a `Result<T>` that carries `throttled` / `duplicate` / `simulated` so a
  view cannot accidentally treat a refusal as a crash.
- A function that both refuses and succeeds in one call is impossible to write
  correctly in this dialect; where that shape appeared it was split.
