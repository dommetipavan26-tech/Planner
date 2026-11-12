-- ============================================================================
-- UtsavAir v2 — corridor enrichment, device identity, watches
-- ----------------------------------------------------------------------------
-- Applied to project txbgovhxqxvlioszevbe on 2026-11-12 through the Supabase
-- connector as migration `utsav_corridor_enrichment_v2`. This file is the
-- repository mirror: the connector records the authoritative history, and this
-- copy exists so the schema can be read, reviewed and rebuilt from source.
--
-- Do not re-apply against the live project.
--
-- What it does
--   1. Adds the operational detail a traveller actually needs to a corridor:
--      cabin/berth, boarding points, manifest deadline, refund rule, amenities
--      and the coordinates that drive the routing diagram.
--   2. Gives pledges a device id (anonymous ownership) and a fare-lock stamp.
--   3. Adds a watches table so "notify me when this corridor moves" can exist
--      without accounts.
--   4. Replaces utsav_join_cohort with a 7-argument version that records the
--      device id and validates harder. The 6-argument version is dropped: a
--      stale client calling it fails loudly instead of writing an orphan row.
--   5. Backfills the detail columns for the seeded corridors and adds the
--      Rajahmundry → Delhi block.
-- ============================================================================

-- 1. Corridor detail --------------------------------------------------------

ALTER TABLE public.utsav_corridors
  ADD COLUMN IF NOT EXISTS cabin_or_berth text,
  ADD COLUMN IF NOT EXISTS boarding_points text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS manifest_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS refund_rule text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS lon numeric(9,6),
  ADD COLUMN IF NOT EXISTS dest_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS dest_lon numeric(9,6),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.utsav_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS utsav_corridors_touch ON public.utsav_corridors;
CREATE TRIGGER utsav_corridors_touch
  BEFORE UPDATE ON public.utsav_corridors
  FOR EACH ROW EXECUTE FUNCTION public.utsav_touch_updated_at();

-- 2. Pledge ownership -------------------------------------------------------

ALTER TABLE public.utsav_pledges
  ADD COLUMN IF NOT EXISTS device_id uuid,
  ADD COLUMN IF NOT EXISTS fare_locked_at timestamptz;

CREATE INDEX IF NOT EXISTS utsav_pledges_device_idx
  ON public.utsav_pledges (device_id);

-- 3. Watches ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.utsav_corridor_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  corridor_id uuid NOT NULL REFERENCES public.utsav_corridors (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, corridor_id)
);

ALTER TABLE public.utsav_corridor_watches ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.utsav_corridor_watches;

-- 4. Functions --------------------------------------------------------------
-- Every one of these is SECURITY DEFINER: the anonymous role holds no table
-- policy on pledges or watches, so device-scoped data can only be read or
-- written through them.

CREATE OR REPLACE FUNCTION public.utsav_watch_corridor(p_device_id uuid, p_corridor_id uuid)
RETURNS public.utsav_corridor_watches
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_row public.utsav_corridor_watches;
BEGIN
  INSERT INTO public.utsav_corridor_watches (device_id, corridor_id)
  VALUES (p_device_id, p_corridor_id)
  ON CONFLICT (device_id, corridor_id) DO UPDATE SET created_at = EXCLUDED.created_at
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.utsav_unwatch_corridor(p_device_id uuid, p_corridor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.utsav_corridor_watches
  WHERE device_id = p_device_id AND corridor_id = p_corridor_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.utsav_my_watches(p_device_id uuid)
RETURNS SETOF public.utsav_corridor_watches
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT * FROM public.utsav_corridor_watches
  WHERE device_id = p_device_id
  ORDER BY created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.utsav_my_pledges(p_device_id uuid)
RETURNS SETOF public.utsav_pledges
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT * FROM public.utsav_pledges
  WHERE device_id = p_device_id
  ORDER BY created_at DESC;
$function$;

-- Replaced signature: the 6-argument v1 function is dropped first so no client
-- can pledge without declaring the device that owns the row.
DROP FUNCTION IF EXISTS public.utsav_join_cohort(uuid, text, text, text, text, integer);

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
BEGIN
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
REVOKE ALL ON FUNCTION public.utsav_my_pledges(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.utsav_my_watches(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.utsav_watch_corridor(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.utsav_unwatch_corridor(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.utsav_join_cohort(uuid, text, text, text, text, integer, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.utsav_my_pledges(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.utsav_my_watches(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.utsav_watch_corridor(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.utsav_unwatch_corridor(uuid, uuid) TO anon, authenticated;

-- 5. Corridor detail backfill ----------------------------------------------
-- Boarding points, cabin/berth, manifest deadlines, refund rules, amenities and
-- coordinates for the seeded blocks. Manifest close is T-72h for air and T-24h
-- for coach, matching the published name-swap windows.

UPDATE public.utsav_corridors AS c SET
  cabin_or_berth = v.cabin_or_berth,
  boarding_points = v.boarding_points,
  refund_rule = v.refund_rule,
  amenities = v.amenities,
  lat = v.lat,
  lon = v.lon,
  dest_lat = v.dest_lat,
  dest_lon = v.dest_lon,
  manifest_deadline = CASE
    WHEN c.mode = 'bus' THEN (c.departure_date::timestamptz + interval '1 day')
    ELSE (c.departure_date::timestamptz - interval '3 days')
  END
FROM (VALUES
  ('VGA-DEL-DW26',
   'Economy · 3-3 · winter-peak block',
   ARRAY['Gannavaram Airport (VGA) · Domestic terminal', 'Benz Circle feeder coach · 17:10'],
   '100% refund if Tier I is not crossed by the lock deadline. Free name swap until T-72h.',
   ARRAY['20 kg check-in', 'Group check-in desk', 'Evening meal onboard'],
   16.5304, 80.7969, 28.5562, 77.1),
  ('DEL-VGA-SK27',
   'Economy · 3-3 · student-friendly name swap window',
   ARRAY['IGI Terminal 2 (DEL) · Group Island C', 'Dwarka Sector 21 metro feeder · 07:20', 'Rohini hostel feeder · 07:05'],
   '100% refund if Tier I is not crossed by the lock deadline. Free name swap until T-72h. Student ID required for the extra 10 kg allowance.',
   ARRAY['15 kg check-in', 'Student +10 kg at ₹450', 'Free name swap to T-72h'],
   28.5562, 77.1, 16.5304, 80.7969),
  ('BLR-GNT-SK27',
   'Scania multi-axle · sleeper · lower berth preferred for families',
   ARRAY['Silk Board junction · 20:30', 'HSR BDA complex · 20:45', 'Marathahalli bridge · 21:10', 'Hebbal flyover · 21:40'],
   '100% refund if Tier I is not crossed by the lock deadline. Berth swap free until 6 hours before departure. Overnight convoy escorted end to end.',
   ARRAY['2x 20 kg luggage bay', 'Sleeper berths', 'Blanket + pillow', 'GPS escort vehicle', 'Breakfast stop at Penukonda'],
   12.9716, 77.5946, 16.3067, 80.4365),
  ('HYD-VGA-SK27',
   'Volvo 9600 multi-axle · 2x2 recliner · reserved berths',
   ARRAY['Gachibowli ORR Junction · 21:45', 'LB Nagar lounge · 22:20', 'Miyapur metro depot · 21:20', 'Uppal ring road · 22:45'],
   '100% refund if Tier I is not crossed by the lock deadline. Berth swap free until 6 hours before departure. No-show berths are released to the waitlist.',
   ARRAY['2x 20 kg luggage bay', 'Reserved berths', 'Onboard charging', 'GPS-tracked convoy', 'Water + snack stop at Suryapet'],
   17.385, 78.4867, 16.5304, 80.7969),
  ('VGA-DEL-SK27',
   'Economy · 3-3 · forward cabin held as one group block',
   ARRAY['Gannavaram Airport (VGA) · Group Desk B', 'Benz Circle feeder coach · 04:40', 'Pandit Nehru Bus Stand feeder · 04:55'],
   '100% refund if Tier I is not crossed by the lock deadline. Free name swap until T-72h. After manifest submission, carrier cancellation rules apply.',
   ARRAY['25 kg check-in', 'Priority group check-in', 'Hot meal included', 'Dedicated corridor marshal'],
   16.5304, 80.7969, 28.5562, 77.1),
  ('VTZ-DEL-SK27',
   'Economy · 3-3 · group block with free name swap',
   ARRAY['Visakhapatnam Airport (VTZ) · Counters 4-6', 'NAD Junction feeder coach · 15:50', 'Madhurawada feeder coach · 15:20'],
   '100% refund if Tier I is not crossed by the lock deadline. Free name swap until T-72h. After manifest submission, carrier cancellation rules apply.',
   ARRAY['15 kg check-in', 'Free name swap to T-72h', 'Snack box', 'Corridor marshal at NAD'],
   17.7212, 83.3017, 28.5562, 77.1),
  ('TIR-DEL-SK27',
   'Economy · 3-3 · charter block, single-class cabin',
   ARRAY['Renigunta Airport (TIR) · Group Counter A', 'Tirupati RTC Complex feeder · 11:30', 'Alipiri toll gate feeder · 11:45'],
   '100% refund if Tier I is not crossed by the lock deadline. Free name swap until T-72h. Charter blocks are non-refundable after manifest submission.',
   ARRAY['15 kg check-in', 'Hot tiffin box', 'Temple-town pickup points'],
   13.6325, 79.5467, 28.5562, 77.1)
) AS v(code, cabin_or_berth, boarding_points, refund_rule, amenities, lat, lon, dest_lat, dest_lon)
WHERE v.code = c.code;

-- Rajahmundry → Delhi: the Godavari NRI request had the most upvotes on the
-- board, so the block was contracted with a single connecting PNR.
INSERT INTO public.utsav_corridors (
  code, festival, origin_city, origin_code, origin_state, dest_city, dest_code, dest_state,
  mode, carrier_name, carrier_code, service_number, departure_date, departure_time, arrival_time,
  duration_label, pickup_hub, normal_fare, festival_surge_fare,
  tier1_min, tier1_fare, tier2_min, tier2_fare, tier3_min, tier3_fare, platform_fee_pct,
  total_allotment, pledged_seats, allotment_status, lock_deadline, contract_ref, baggage_allowance,
  cabin_or_berth, boarding_points, manifest_deadline, refund_rule, amenities,
  lat, lon, dest_lat, dest_lon
) VALUES (
  'RJA-DEL-SK27', 'Sankranti 2027', 'Rajahmundry', 'RJA', 'Andhra Pradesh', 'New Delhi', 'DEL', 'Delhi NCR',
  'flight', 'IndiGo Group Allotment', '6E', '6E-2461', '2027-01-14', '11:05', '15:30',
  '4h 25m · 1 stop at HYD', 'Rajahmundry Airport · Group Counter', 6400, 15900,
  15, 9250, 30, 8050, 45, 7150, 4.5,
  45, 9, 'collecting', '2026-12-30T18:30:00Z', '6E-CORP-BLK-9944', '15 kg Check-in + 7 kg Cabin',
  'Economy · 3-3 · connecting block, both legs on one PNR',
  ARRAY['Rajahmundry Airport (RJA) · Group counter', 'Danavaipeta feeder coach · 09:20'],
  '2027-01-11T18:30:00Z',
  '100% refund if Tier I is not crossed by the lock deadline. Missed connection is rebooked by the carrier at no cost.',
  ARRAY['15 kg check-in', 'Single PNR for both legs', 'Lounge access at HYD on the connection'],
  17.1232, 81.812, 28.5562, 77.1
)
ON CONFLICT (code) DO UPDATE SET
  cabin_or_berth = EXCLUDED.cabin_or_berth,
  boarding_points = EXCLUDED.boarding_points,
  manifest_deadline = EXCLUDED.manifest_deadline,
  refund_rule = EXCLUDED.refund_rule,
  amenities = EXCLUDED.amenities,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  dest_lat = EXCLUDED.dest_lat,
  dest_lon = EXCLUDED.dest_lon;
