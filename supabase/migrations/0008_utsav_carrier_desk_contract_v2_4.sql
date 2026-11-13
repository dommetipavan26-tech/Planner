-- =============================================================================
-- utsav_carrier_desk_contract_v2_4 — contract half of the carrier desk work
-- =============================================================================
-- Local mirror of a migration applied to project txbgovhxqxvlioszevbe. The
-- remote copy is authoritative; this file exists so the schema is reviewable in
-- git. It must not be re-applied.
--
-- `utsav_carrier_desk_v2_3` added the desks, the sessions and the functions
-- without removing anything, so the bundle that was live at the time kept
-- working. This file removes what the new bundle no longer needs, and it is only
-- safe to run once that bundle is deployed. Order matters: expand, deploy,
-- contract.
--
-- Three removals:
--
-- 1. The anonymous INSERT policies and privileges on `utsav_carrier_bids` and
--    `utsav_corridor_requests`. Until now any browser with the publishable anon
--    key could write a bid row directly, including one already marked 'accepted'
--    that the public board renders as a confirmed block, and a request row with
--    an arbitrary `upvotes` value. Both tables are now written only through
--    SECURITY DEFINER functions that derive identity from a desk session or from
--    a device-scoped throttle.
--
-- 2. `utsav_carrier_bids.desk_contact`, a desk email address in a table whose
--    SELECT policy is `true` — world-readable — while the bid form told the
--    carrier that field was "not published". The address now lives only on
--    `utsav_carriers`, which has RLS enabled and zero policies, and the public
--    bid row carries the non-personal `desk_ref` desk code instead.
--
-- 3. `utsav_upvote_request(uuid)`, the unbounded one-argument counter bump. The
--    two-argument version records one vote per (request, device) in a zero-policy
--    table, so a loop cannot manufacture demand and re-order the request board.
-- =============================================================================

-- 1. Close the anonymous write paths -----------------------------------------

drop policy if exists utsav_carrier_bids_insert      on public.utsav_carrier_bids;
drop policy if exists utsav_corridor_requests_insert on public.utsav_corridor_requests;

revoke insert on public.utsav_carrier_bids      from public, anon, authenticated;
revoke insert on public.utsav_corridor_requests from public, anon, authenticated;

-- 2. Take the desk email off the public table --------------------------------

alter table public.utsav_carrier_bids drop column if exists desk_contact;

-- 3. Drop the unbounded upvote -----------------------------------------------

drop function if exists public.utsav_upvote_request(uuid);
