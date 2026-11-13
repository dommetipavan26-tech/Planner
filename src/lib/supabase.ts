/**
 * Ledger access.
 *
 * The Supabase SDK is loaded on demand: the desk paints from its bundled
 * snapshot mirror immediately, then swaps in live Postgres rows as soon as the
 * client chunk arrives. That keeps ~59 kB of gzip off the critical path without
 * the UI ever waiting on it.
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
} as const;

/** Minimal surface the hook needs, so this module has no SDK type import. */
export interface LedgerClient {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  channel: (topic: string) => any;
  removeChannel: (channel: unknown) => Promise<string> | string;
}

let clientPromise: Promise<LedgerClient | null> | null = null;

/** Resolves to the shared client, or null when it cannot be constructed. */
export function ledgerClient(): Promise<LedgerClient | null> {
  if (clientPromise) return clientPromise;
  clientPromise = import('@supabase/supabase-js')
    .then(({ createClient }) => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 6 } },
        global: { headers: { 'x-client-info': 'utsavair-web/2.0' } },
      });
      return client as unknown as LedgerClient;
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
  return /wait a moment before holding again|already holds \d+ live pledges/i.test(
    error.message ?? '',
  );
}
