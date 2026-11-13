-- ============================================================================
-- UtsavAir v2.1 — privacy hardening
-- ----------------------------------------------------------------------------
-- Applied to project txbgovhxqxvlioszevbe on 2026-11-12 through the Supabase
-- connector as migration `utsav_privacy_hardening_v2_1`. Repository mirror; do
-- not re-apply against the live project.
--
-- Why
--   v1 left `utsav_pledges` readable and writable by the anonymous role, and
--   `utsav_corridor_requests` updatable by anyone. That meant the publishable
--   anon key — which ships to the browser by design — could enumerate every
--   traveller's phone number, and could set any upvote count it liked.
--
-- What changes
--   * Pledges: no anonymous policy at all. Writes go through
--     utsav_join_cohort, owner reads through utsav_my_pledges, public reads
--     through the new utsav_public_pledges projection.
--   * Watches: no anonymous policy. Both directions go through their functions.
--   * Requests: the public UPDATE policy is dropped; upvotes only move through
--     utsav_upvote_request.
--   * Carrier bids keep public read and insert — the desk form needs it, and a
--     bid row contains no traveller data.
--
-- Consequence for the client
--   Realtime no longer delivers pledge payloads to anonymous subscribers, so the
--   app treats a corridor UPDATE as the pledge signal (every pledge write moves
--   pledged_seats / allotment_status) and re-reads the public feed through the
--   projection. See src/hooks/useLedger.ts.
-- ============================================================================

DROP POLICY IF EXISTS utsav_pledges_read ON public.utsav_pledges;
DROP POLICY IF EXISTS utsav_pledges_insert ON public.utsav_pledges;
DROP POLICY IF EXISTS utsav_corridor_requests_update ON public.utsav_corridor_requests;
DROP POLICY IF EXISTS utsav_watches_insert ON public.utsav_corridor_watches;

CREATE OR REPLACE FUNCTION public.utsav_public_pledges(p_limit integer DEFAULT 12)
RETURNS TABLE (
  id uuid,
  corridor_id uuid,
  booking_ref text,
  passenger_name text,
  passenger_cohort text,
  seats integer,
  max_willing_fare integer,
  locked_unit_fare integer,
  platform_fee_unit integer,
  total_payable integer,
  estimated_saving integer,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.id,
         p.corridor_id,
         p.booking_ref,
         p.passenger_name,
         p.passenger_cohort,
         p.seats,
         p.max_willing_fare,
         p.locked_unit_fare,
         p.platform_fee_unit,
         p.total_payable,
         p.estimated_saving,
         p.status,
         p.created_at
  FROM public.utsav_pledges p
  ORDER BY p.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$fn$;

REVOKE ALL ON FUNCTION public.utsav_public_pledges(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utsav_public_pledges(integer) TO anon, authenticated;

COMMENT ON FUNCTION public.utsav_public_pledges(integer) IS
  'Public activity feed: recent pledges projected without phone numbers, boarding points or device ids.';

COMMENT ON TABLE public.utsav_pledges IS
  'Pledge rows. No anonymous policy: writes go through utsav_join_cohort, owner reads through utsav_my_pledges, public reads through utsav_public_pledges.';
