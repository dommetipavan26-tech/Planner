/**
 * Ledger access.
 *
 * The ledger client is loaded on demand: the desk paints from its bundled
 * snapshot mirror immediately, then swaps in live Postgres rows as soon as the
 * client chunk arrives. That keeps it off the critical path without the UI ever
 * waiting on it.
 *
 * This depends on `@supabase/postgrest-js` and `@supabase/realtime-js` directly
 * rather than on the `@supabase/supabase-js` umbrella, because the umbrella also
 * bundles auth-js, storage-js and functions-js — three clients this app never
 * calls. They are the same libraries the umbrella constructs internally, at the
 * same versions, so the wire protocol is not re-implemented here; only the parts
 * we do not use are dropped. That equivalence was checked rather than assumed: a
 * local PostgREST stub captured the requests both clients make for every query
 * shape this app issues (ordered select, rpc, insert-select-single) and the
 * method, path, query string and body were byte-identical; the only difference
 * was `x-client-info`, which is a telemetry string. See docs/adr/0004.
 *
 * The publishable anon key ships to the browser by design. Nothing money-bearing
 * is writable from it: corridor state changes only through SECURITY DEFINER
 * functions, and device-scoped rows are readable only through them either.
 */

const PROJECT_REF = 'txbgovhxqxvlioszevbe';
const FALLBACK_URL = `https://${PROJECT_REF}.supabase.co`;
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4Ymdvdmh4cXh2bGlvc3pldmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDIzNzgsImV4cCI6MjExMDA3ODM3OH0.MaEoUsZueNS6oAvzt79t1OA9AzzbIBh07pZSDywnAE0';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() || FALLBACK_URL;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() || FALLBACK_ANON_KEY;
export const PROJECT_SLUG = PROJECT_REF;

export const TABLE = {
  corridor: 'utsav_corridors',
  pledge: 'utsav_pledges',
  bid: 'utsav_carrier_bids',
  request: 'utsav_corridor_requests',
  watch: 'utsav_corridor_watches',
} as const;

export const FN = {
  joinCohort: 'utsav_join_cohort',
  upvoteRequest: 'utsav_upvote_request',
  myPledges: 'utsav_my_pledges',
  publicPledges: 'utsav_public_pledges',
  myWatches: 'utsav_my_watches',
  watch: 'utsav_watch_corridor',
  unwatch: 'utsav_unwatch_corridor',
  // Carrier desk. Bids and requests are written through these rather than through
  // a table insert: identity comes from the session or the device, not from the
  // caller, and the anonymous INSERT policies are gone.
  carrierSignin: 'utsav_carrier_desk_signin',
  carrierSession: 'utsav_carrier_desk_session',
  carrierSignout: 'utsav_carrier_desk_signout',
  submitBid: 'utsav_submit_bid',
  submitRequest: 'utsav_submit_request',
} as const;

/** Minimal surface the hook needs, so this module has no SDK type import. */
export interface LedgerClient {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  channel: (topic: string) => any;
  removeChannel: (channel: unknown) => Promise<string> | string;
}

/** Identifies this client in Supabase's request logs. */
const CLIENT_INFO = 'utsavair-web/2.0 (postgrest-js, realtime-js)';

/** Realtime messages per second this client is allowed to push. */
const EVENTS_PER_SECOND = 6;

let clientPromise: Promise<LedgerClient | null> | null = null;

/**
 * Resolves to the shared client, or null when it cannot be constructed.
 *
 * The two endpoint URLs are derived exactly the way the umbrella package derives
 * them — `new URL('rest/v1', base)` and `new URL('realtime/v1', base)` with the
 * protocol rewritten to `ws` — so a project URL with a trailing slash or a path
 * prefix resolves the same here as it did there.
 */
export function ledgerClient(): Promise<LedgerClient | null> {
  if (clientPromise) return clientPromise;
  clientPromise = Promise.all([import('@supabase/postgrest-js'), import('@supabase/realtime-js')])
    .then(([{ PostgrestClient }, { RealtimeClient }]) => {
      const base = new URL(SUPABASE_URL);

      const rest = new PostgrestClient(new URL('rest/v1', base).href, {
        headers: {
          // What the umbrella's fetch wrapper adds to every request when there is
          // no session: the anon key as both apikey and bearer.
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'x-client-info': CLIENT_INFO,
        },
        schema: 'public',
      });

      const realtimeUrl = new URL('realtime/v1', base);
      realtimeUrl.protocol = realtimeUrl.protocol.replace('http', 'ws');
      const realtime = new RealtimeClient(realtimeUrl.href, {
        params: { apikey: SUPABASE_ANON_KEY, eventsPerSecond: EVENTS_PER_SECOND },
        headers: { 'x-client-info': CLIENT_INFO },
      });

      return {
        from: (table: string) => rest.from(table),
        rpc: (fn: string, args?: Record<string, unknown>) => rest.rpc(fn, args),
        channel: (topic: string) => realtime.channel(topic),
        removeChannel: (channel: unknown) =>
          realtime.removeChannel(channel as Parameters<typeof realtime.removeChannel>[0]),
      } satisfies LedgerClient;
    })
    .catch(() => null);
  return clientPromise;
}

/**
 * Connectivity failures should fall back to the local mirror; constraint and
 * validation failures should reach the reader verbatim. This is the heuristic
 * that tells them apart.
 */
export function isConnectivityError(message: string): boolean {
  return /fetch|network|timeout|timed out|econn|socket|offline|failed to/i.test(message);
}

/**
 * The SQLSTATE `utsav_join_cohort` raises when it is refusing a *pace*, not a
 * pledge: a second join from one device inside five seconds, or a thirteenth
 * live pledge. It is its own code so the client never has to guess from prose,
 * and never mistakes a refusal for a dropped connection — a throttled write did
 * not happen, so it must not be mirrored locally as though it had.
 */
export const THROTTLED_SQLSTATE = 'UT429';

/** Shape of the error object a PostgREST call hands back. */
export interface LedgerError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** True when the ledger refused the write because the caller is going too fast. */
export function isThrottleError(error: LedgerError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === THROTTLED_SQLSTATE) return true;
  // Fall back to the text: an older edge or a proxy can strip the SQLSTATE.
  return /wait a moment before (holding|logging|posting|upvoting)|already holds \d+ live pledges|has logged \d+ bids|has posted \d+ requests|has upvoted \d+ requests|is locked after repeated failed sign-ins/i.test(
    error.message ?? '',
  );
}

/**
 * The SQLSTATE the carrier desk functions use for "you are not signed in, or that
 * session ended". It is separate from `THROTTLED_SQLSTATE` because the remedy is
 * different: a throttle means wait, this means sign in again — and the client must
 * drop the stored session rather than retry it.
 */
export const UNAUTHENTICATED_SQLSTATE = 'UT401';

/** True when the ledger says the caller has no live desk session. */
export function isAuthError(error: LedgerError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === UNAUTHENTICATED_SQLSTATE) return true;
  return /desk session has ended|desk credentials were not recognised|desk is suspended/i.test(
    error.message ?? '',
  );
}

/**
 * PostgREST's answer when the function we called is not in its schema cache: the
 * browser is running a build that expects a ledger this project does not have yet,
 * or no longer has. That is a version skew, not a validation failure, so it is
 * treated like an unreachable ledger and the write falls back to the local mirror
 * — which is always reported as `simulated`, never as a real row.
 *
 * Deliberately narrow: only the "no such function" codes. `42883`
 * (undefined_function raised *inside* a function) is excluded on purpose, because
 * swallowing it would hide exactly the class of bug it once signalled here — a
 * SECURITY DEFINER function pinned to `search_path = public` calling
 * `crypt()` from `extensions`. That failure should be loud.
 */
export const MISSING_FUNCTION_CODES = ['PGRST202', 'PGRST203'] as const;

export function isMissingFunctionError(error: LedgerError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && (MISSING_FUNCTION_CODES as readonly string[]).includes(error.code)) return true;
  return /could not find the function/i.test(error.message ?? '');
}
