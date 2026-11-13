-- ============================================================================
-- utsav_join_throttle_v2_2 — the pledge write becomes idempotent and rate-limited
--
-- Why. `utsav_join_cohort` is callable by anon, because a traveller holds a seat
-- long before they have an account. That is deliberate — and it meant a
-- double-tapped button, a retry after a response that never arrived, or a
-- hand-rolled loop could each write another pledge and move `pledged_seats`
-- again. The first two are accidents that cost a real seat in a real block; the
-- third is why a limit exists at all.
--
-- What changed, in the order the function now checks it:
--
--   1. Idempotent retry. Same device, same corridor, same seat count, same lead
--      passenger, within 120 seconds → the pledge that already exists is
--      returned and nothing is written. A retry therefore gets the same answer
--      as the request it retried, and the block does not lose a second seat to
--      it. A different traveller on the same corridor — the second half of a
--      family, say — has a different name and is not a duplicate.
--   2. Cooldown. Five seconds between pledges from one device.
--   3. Live cap. Twelve unreleased pledges per device.
--
--   2 and 3 raise SQLSTATE 'UT429' instead of the default 'P0001', so the client
--   can tell "you are going too fast" from "that pledge is invalid" and say
--   something useful. See humanise() in src/hooks/useLedger.ts.
--
-- What this is NOT. `device_id` is minted in the browser, so anyone can make as
-- many as they like: per-device limits stop accidents and casual hammering, not
-- a determined abuser. Closing that properly means putting pledge writes behind
-- authentication. The oversell guarantee is separate and older — the corridor
-- row is locked FOR UPDATE first, so concurrent joins on one block serialise and
-- cannot take it past `total_allotment`.
--
-- Ordering worth preserving: the duplicate check runs BEFORE the
-- seat-availability check, so a retry that lands after the block has filled
-- still returns the pledge its caller already owns rather than an error.
--
-- `SET search_path = public` is added while the body is being replaced: a
-- SECURITY DEFINER function without a fixed search_path can be redirected by
-- whoever owns a schema earlier on the path.
-- ============================================================================

CREATE INDEX IF NOT EXISTS utsav_pledges_device_created_idx
  ON public.utsav_pledges (device_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.utsav_join_cohort(
  p_corridor_id uuid,
  p_passenger_name text,
  p_passenger_phone text,
  p_passenger_cohort text,
  p_boarding_point text,
  p_seats integer,
  p_device_id uuid
)
RETURNS public.utsav_pledges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_corridor public.utsav_corridors;
  v_new_seats integer;
  v_unit_fare integer;
  v_fee_unit integer;
  v_saving integer;
  v_new_status text;
  v_ref text;
  v_pledge public.utsav_pledges;
  v_duplicate public.utsav_pledges;
  v_last_pledge_at timestamptz;
  v_live_pledges integer;
BEGIN
  -- Lock the block first. Concurrent joins serialise here, which is what makes
  -- both the seat arithmetic below and the duplicate check race-free: the second
  -- caller waits, then reads the row the first one committed.
  SELECT * INTO v_corridor FROM public.utsav_corridors WHERE id = p_corridor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corridor not found';
  END IF;

  IF p_seats < 1 OR p_seats > 8 THEN
    RAISE EXCEPTION 'Seats per pledge must be between 1 and 8';
  END IF;

  IF length(btrim(coalesce(p_passenger_name, ''))) < 3 THEN
    RAISE EXCEPTION 'Passenger name must be at least 3 characters';
  END IF;

  IF length(regexp_replace(coalesce(p_passenger_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'A 10-digit mobile number is required';
  END IF;

  -- 1. Idempotent retry: this device already wrote this pledge moments ago.
  SELECT * INTO v_duplicate
  FROM public.utsav_pledges
  WHERE device_id = p_device_id
    AND corridor_id = p_corridor_id
    AND seats = p_seats
    AND lower(btrim(passenger_name)) = lower(btrim(coalesce(p_passenger_name, '')))
    AND status <> 'released'
    AND created_at > now() - interval '120 seconds'
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_duplicate;
  END IF;

  -- 2. Cooldown between pledges from one device.
  SELECT max(created_at) INTO v_last_pledge_at
  FROM public.utsav_pledges
  WHERE device_id = p_device_id;
  IF v_last_pledge_at IS NOT NULL AND v_last_pledge_at > now() - interval '5 seconds' THEN
    RAISE EXCEPTION 'This device pledged % second(s) ago; wait a moment before holding again',
      greatest(0, round(extract(epoch from (now() - v_last_pledge_at)))::integer)
      USING ERRCODE = 'UT429';
  END IF;

  -- 3. Cap on unreleased pledges held by one device.
  SELECT count(*) INTO v_live_pledges
  FROM public.utsav_pledges
  WHERE device_id = p_device_id
    AND status <> 'released';
  IF v_live_pledges >= 12 THEN
    RAISE EXCEPTION 'This device already holds 12 live pledges; release one before holding another'
      USING ERRCODE = 'UT429';
  END IF;

  IF v_corridor.pledged_seats + p_seats > v_corridor.total_allotment THEN
    RAISE EXCEPTION 'Requested seats exceed remaining airline group allotment';
  END IF;

  v_new_seats := v_corridor.pledged_seats + p_seats;

  IF v_new_seats >= v_corridor.tier3_min THEN
    v_unit_fare := v_corridor.tier3_fare;
    v_new_status := 'tier3_locked';
  ELSIF v_new_seats >= v_corridor.tier2_min THEN
    v_unit_fare := v_corridor.tier2_fare;
    v_new_status := 'tier2_locked';
  ELSIF v_new_seats >= v_corridor.tier1_min THEN
    v_unit_fare := v_corridor.tier1_fare;
    v_new_status := 'tier1_locked';
  ELSE
    v_unit_fare := v_corridor.tier1_fare;
    v_new_status := 'collecting';
  END IF;

  v_fee_unit := ROUND(v_unit_fare * (v_corridor.platform_fee_pct / 100.0));
  v_saving := GREATEST(0, (v_corridor.festival_surge_fare - (v_unit_fare + v_fee_unit)) * p_seats);
  v_ref := 'UTV-' || UPPER(SUBSTRING(MD5(random()::text || clock_timestamp()::text) FROM 1 FOR 6));

  UPDATE public.utsav_corridors
  SET pledged_seats = v_new_seats,
      allotment_status = v_new_status
  WHERE id = p_corridor_id;

  INSERT INTO public.utsav_pledges (
    corridor_id, booking_ref, passenger_name, passenger_phone, passenger_cohort,
    boarding_point, seats, max_willing_fare, locked_unit_fare, platform_fee_unit,
    total_payable, estimated_saving, status, device_id
  ) VALUES (
    p_corridor_id, v_ref, btrim(p_passenger_name), btrim(p_passenger_phone),
    COALESCE(NULLIF(btrim(p_passenger_cohort), ''), 'General cohort'), btrim(p_boarding_point),
    p_seats, v_corridor.festival_surge_fare, v_unit_fare, v_fee_unit,
    (v_unit_fare + v_fee_unit) * p_seats, v_saving,
    CASE WHEN v_new_seats >= v_corridor.tier1_min THEN 'allotment_confirmed' ELSE 'escrow_held' END,
    p_device_id
  ) RETURNING * INTO v_pledge;

  RETURN v_pledge;
END;
$function$;

REVOKE ALL ON FUNCTION public.utsav_join_cohort(uuid, text, text, text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utsav_join_cohort(uuid, text, text, text, text, integer, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.utsav_join_cohort(uuid, text, text, text, text, integer, uuid) IS
  'Holds seats in a corridor block. Idempotent for a repeat of the same device, corridor, seat count and lead passenger within 120 seconds; rate-limited to one pledge per 5 seconds and 12 live pledges per device (SQLSTATE UT429). Serialises on the corridor row, so concurrent joins cannot oversell the allotment.';
