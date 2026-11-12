import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * UtsavAir corridor desk runs entirely against Supabase: Postgres for the
 * corridor/pledge ledger, Realtime (postgres_changes) for the live cohort board.
 *
 * The publishable anon key is intentionally shipped to the browser — every
 * money-bearing mutation goes through SECURITY DEFINER RPCs and RLS, never
 * through a raw client write.
 */
const FALLBACK_URL = 'https://txbgovhxqxvlioszevbe.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4Ymdvdmh4cXh2bGlvc3pldmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDIzNzgsImV4cCI6MjExMDA3ODM3OH0.MaEoUsZueNS6oAvzt79t1OA9AzzbIBh07pZSDywnAE0';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? FALLBACK_URL;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? FALLBACK_ANON_KEY;
export const LINEAR_TEAM_KEY = env.VITE_LINEAR_TEAM_KEY ?? 'PAV';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 8 } },
    });
    return client;
  } catch {
    return null;
  }
}

export const TABLES = {
  corridors: 'utsav_corridors',
  pledges: 'utsav_pledges',
  bids: 'utsav_carrier_bids',
  requests: 'utsav_corridor_requests',
} as const;

export const RPC = {
  joinCohort: 'utsav_join_cohort',
  upvoteRequest: 'utsav_upvote_request',
} as const;
