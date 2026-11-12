-- UtsavAir — Festival Bulk Corridor Desk
-- Applied to Supabase project txbgovhxqxvlioszevbe (ap-south-1, Postgres 17)
-- as migration "utsav_corridor_schema_and_seed".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.utsav_corridors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  festival text NOT NULL,
  origin_city text NOT NULL,
  origin_code text NOT NULL,
  origin_state text NOT NULL,
  dest_city text NOT NULL,
  dest_code text NOT NULL,
  dest_state text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('flight', 'bus')),
  carrier_name text NOT NULL,
  carrier_code text NOT NULL,
  service_number text NOT NULL,
  departure_date date NOT NULL,
  departure_time text NOT NULL,
  arrival_time text NOT NULL,
  duration_label text NOT NULL,
  pickup_hub text NOT NULL,
  normal_fare integer NOT NULL,
  festival_surge_fare integer NOT NULL,
  tier1_min integer NOT NULL DEFAULT 15,
  tier1_fare integer NOT NULL,
  tier2_min integer NOT NULL DEFAULT 30,
  tier2_fare integer NOT NULL,
  tier3_min integer NOT NULL DEFAULT 45,
  tier3_fare integer NOT NULL,
  platform_fee_pct numeric(4,2) NOT NULL DEFAULT 4.50,
  total_allotment integer NOT NULL DEFAULT 60,
  pledged_seats integer NOT NULL DEFAULT 0,
  allotment_status text NOT NULL DEFAULT 'collecting'
    CHECK (allotment_status IN ('collecting', 'tier1_locked', 'tier2_locked', 'tier3_locked', 'issued')),
  lock_deadline timestamptz NOT NULL,
  contract_ref text NOT NULL,
  baggage_allowance text NOT NULL DEFAULT '15 kg Check-in + 7 kg Cabin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utsav_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id uuid NOT NULL REFERENCES public.utsav_corridors(id) ON DELETE CASCADE,
  booking_ref text UNIQUE NOT NULL,
  passenger_name text NOT NULL,
  passenger_phone text NOT NULL,
  passenger_cohort text NOT NULL DEFAULT 'General',
  boarding_point text NOT NULL,
  seats integer NOT NULL CHECK (seats >= 1 AND seats <= 8),
  max_willing_fare integer NOT NULL,
  locked_unit_fare integer NOT NULL,
  platform_fee_unit integer NOT NULL,
  total_payable integer NOT NULL,
  estimated_saving integer NOT NULL,
  status text NOT NULL DEFAULT 'escrow_held'
    CHECK (status IN ('escrow_held', 'allotment_confirmed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utsav_carrier_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id uuid REFERENCES public.utsav_corridors(id) ON DELETE SET NULL,
  corridor_code text NOT NULL,
  carrier_name text NOT NULL,
  desk_contact text NOT NULL,
  offered_seats integer NOT NULL CHECK (offered_seats >= 10),
  net_group_fare integer NOT NULL,
  baggage_terms text NOT NULL,
  hold_window_hours integer NOT NULL DEFAULT 72,
  notes text,
  bid_status text NOT NULL DEFAULT 'under_review'
    CHECK (bid_status IN ('under_review', 'accepted', 'countered')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utsav_corridor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_city text NOT NULL,
  dest_city text NOT NULL,
  festival text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('flight', 'bus')),
  travel_window text NOT NULL,
  requester_name text NOT NULL,
  group_size integer NOT NULL DEFAULT 1,
  upvotes integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS utsav_corridors_departure_idx
  ON public.utsav_corridors (departure_date);
CREATE INDEX IF NOT EXISTS utsav_pledges_corridor_idx
  ON public.utsav_pledges (corridor_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RPCs: all money-bearing mutation happens here, never from the browser
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.utsav_join_cohort(
  p_corridor_id uuid,
  p_passenger_name text,
  p_passenger_phone text,
  p_passenger_cohort text,
  p_boarding_point text,
  p_seats integer
) RETURNS public.utsav_pledges
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    total_payable, estimated_saving, status
  ) VALUES (
    p_corridor_id, v_ref, TRIM(p_passenger_name), TRIM(p_passenger_phone),
    COALESCE(NULLIF(TRIM(p_passenger_cohort), ''), 'General'), TRIM(p_boarding_point),
    p_seats, v_corridor.festival_surge_fare, v_unit_fare, v_fee_unit,
    (v_unit_fare + v_fee_unit) * p_seats, v_saving,
    CASE WHEN v_new_seats >= v_corridor.tier1_min THEN 'allotment_confirmed' ELSE 'escrow_held' END
  ) RETURNING * INTO v_pledge;

  RETURN v_pledge;
END;
$$;

CREATE OR REPLACE FUNCTION public.utsav_upvote_request(p_request_id uuid)
RETURNS public.utsav_corridor_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req public.utsav_corridor_requests;
BEGIN
  UPDATE public.utsav_corridor_requests
  SET upvotes = upvotes + 1
  WHERE id = p_request_id
  RETURNING * INTO v_req;
  RETURN v_req;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.utsav_corridors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utsav_pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utsav_carrier_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utsav_corridor_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "utsav_corridors_read" ON public.utsav_corridors;
CREATE POLICY "utsav_corridors_read" ON public.utsav_corridors FOR SELECT USING (true);

DROP POLICY IF EXISTS "utsav_pledges_read" ON public.utsav_pledges;
CREATE POLICY "utsav_pledges_read" ON public.utsav_pledges FOR SELECT USING (true);

DROP POLICY IF EXISTS "utsav_pledges_insert" ON public.utsav_pledges;
CREATE POLICY "utsav_pledges_insert" ON public.utsav_pledges FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "utsav_carrier_bids_read" ON public.utsav_carrier_bids;
CREATE POLICY "utsav_carrier_bids_read" ON public.utsav_carrier_bids FOR SELECT USING (true);

DROP POLICY IF EXISTS "utsav_carrier_bids_insert" ON public.utsav_carrier_bids;
CREATE POLICY "utsav_carrier_bids_insert" ON public.utsav_carrier_bids FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "utsav_corridor_requests_read" ON public.utsav_corridor_requests;
CREATE POLICY "utsav_corridor_requests_read" ON public.utsav_corridor_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "utsav_corridor_requests_insert" ON public.utsav_corridor_requests;
CREATE POLICY "utsav_corridor_requests_insert" ON public.utsav_corridor_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "utsav_corridor_requests_update" ON public.utsav_corridor_requests;
CREATE POLICY "utsav_corridor_requests_update" ON public.utsav_corridor_requests FOR UPDATE USING (true);

GRANT EXECUTE ON FUNCTION public.utsav_join_cohort(uuid, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.utsav_upvote_request(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'utsav_corridors') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.utsav_corridors;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'utsav_pledges') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.utsav_pledges;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'utsav_carrier_bids') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.utsav_carrier_bids;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'utsav_corridor_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.utsav_corridor_requests;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Seed: Sankranti 2027 / winter-peak corridors
-- ---------------------------------------------------------------------------

INSERT INTO public.utsav_corridors (
  code, festival, origin_city, origin_code, origin_state, dest_city, dest_code, dest_state,
  mode, carrier_name, carrier_code, service_number, departure_date, departure_time, arrival_time,
  duration_label, pickup_hub, normal_fare, festival_surge_fare,
  tier1_min, tier1_fare, tier2_min, tier2_fare, tier3_min, tier3_fare,
  platform_fee_pct, total_allotment, pledged_seats, allotment_status, lock_deadline,
  contract_ref, baggage_allowance
) VALUES
('VGA-DEL-SK27', 'Sankranti 2027', 'Vijayawada (Amaravati)', 'VGA', 'Andhra Pradesh', 'New Delhi', 'DEL', 'Delhi NCR',
 'flight', 'Air India Group Desk', 'AI', 'AI-460 Series', '2027-01-12', '06:25', '08:55', '2h 30m Non-stop',
 'Gannavaram Terminal 1 • Gate Group Desk B', 5400, 14850, 15, 8900, 30, 7650, 45, 6800,
 4.50, 60, 38, 'tier2_locked', '2026-12-28T18:30:00Z', 'IATA-GRP-AI-VGA27',
 '25 kg Check-in + 7 kg Cabin (Student/Family Bonus)'),
('VTZ-DEL-SK27', 'Sankranti 2027', 'Visakhapatnam', 'VTZ', 'Andhra Pradesh', 'New Delhi', 'DEL', 'Delhi NCR',
 'flight', 'IndiGo Group Allotment', '6E', '6E-2174', '2027-01-13', '17:40', '20:05', '2h 25m Non-stop',
 'Visakhapatnam Airport • Counter 4-6', 5800, 16200, 15, 9400, 30, 8100, 45, 7250,
 4.50, 60, 46, 'tier3_locked', '2026-12-29T18:30:00Z', '6E-CORP-BLK-9921',
 '15 kg Check-in + 7 kg Cabin + Free Name Swap T-72h'),
('DEL-VGA-SK27', 'Sankranti 2027', 'New Delhi', 'DEL', 'Delhi NCR', 'Vijayawada (Amaravati)', 'VGA', 'Andhra Pradesh',
 'flight', 'IndiGo Group Allotment', '6E', '6E-6043', '2027-01-11', '09:15', '11:45', '2h 30m Non-stop',
 'IGI Terminal 2 • Group Check-in Island C', 5350, 15400, 15, 9100, 30, 7800, 45, 6950,
 4.50, 54, 27, 'tier1_locked', '2026-12-27T18:30:00Z', '6E-CORP-BLK-9870',
 '15 kg Check-in + 7 kg Cabin + Free Name Swap T-72h'),
('TIR-DEL-SK27', 'Sankranti 2027', 'Tirupati', 'TIR', 'Andhra Pradesh', 'New Delhi', 'DEL', 'Delhi NCR',
 'flight', 'Akasa Air Charter Block', 'QP', 'QP-1418', '2027-01-17', '13:10', '15:55', '2h 45m Non-stop',
 'Renigunta Terminal • Group Counter A', 6100, 16900, 15, 9950, 30, 8600, 45, 7700,
 4.50, 48, 12, 'collecting', '2027-01-02T18:30:00Z', 'QP-SERIES-AP-404', '15 kg Check-in + 7 kg Cabin'),
('HYD-VGA-SK27', 'Sankranti 2027', 'Hyderabad (Gachibowli)', 'HYD', 'Telangana', 'Amaravati / Vijayawada', 'VGA', 'Andhra Pradesh',
 'bus', 'APSRTC Vennela × Orange Volvo 9600', 'APS', 'VNL-9600-BLK', '2027-01-12', '21:45', '03:30', '5h 45m NH-65 Express',
 'Gachibowli ORR Junction & LB Nagar Lounge', 780, 2950, 15, 1380, 30, 1150, 40, 990,
 4.00, 44, 34, 'tier2_locked', '2027-01-05T18:30:00Z', 'FLEET-NH65-VOLVO-12',
 '2x 20 kg Luggage Bay + Reserved Single/Double Berths'),
('BLR-GNT-SK27', 'Sankranti 2027', 'Bengaluru (Silk Board)', 'BLR', 'Karnataka', 'Guntur / Amaravati', 'GNT', 'Andhra Pradesh',
 'bus', 'Kaveri × Morning Star Scania Multi-Axle', 'KVR', 'SCN-1450-AP', '2027-01-12', '20:30', '06:45', '10h 15m Overnight Sleeper',
 'HSR BDA, Marathahalli & Hebbal Flyover', 1250, 4100, 15, 1950, 30, 1680, 40, 1490,
 4.00, 42, 31, 'tier2_locked', '2027-01-04T18:30:00Z', 'FLEET-BLRAP-SCN-08',
 '2x 20 kg Luggage Bay + Live GPS Corridor Escort'),
('VGA-DEL-DW26', 'Kartika Purnima / Winter Wedding Peak', 'Vijayawada (Amaravati)', 'VGA', 'Andhra Pradesh', 'New Delhi', 'DEL', 'Delhi NCR',
 'flight', 'Air India Express Group', 'IX', 'IX-2742', '2026-11-24', '18:50', '21:20', '2h 30m Non-stop',
 'Gannavaram Domestic Terminal', 5200, 13600, 15, 8300, 30, 7200, 45, 6450,
 4.50, 50, 41, 'tier2_locked', '2026-11-18T18:30:00Z', 'IX-GRP-NOV26-81', '20 kg Check-in + 7 kg Cabin')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.utsav_pledges (
  corridor_id, booking_ref, passenger_name, passenger_phone, passenger_cohort, boarding_point,
  seats, max_willing_fare, locked_unit_fare, platform_fee_unit, total_payable, estimated_saving, status
)
SELECT id, 'UTV-AP9041', 'Chaitanya Rao & Family', '+91 98480 •••12', 'Delhi PSU / Central Govt Families',
       'Benz Circle Feeder → VGA', 4, 14850, 7650, 344, 31976, 27424, 'allotment_confirmed'
FROM public.utsav_corridors WHERE code = 'VGA-DEL-SK27'
ON CONFLICT (booking_ref) DO NOTHING;

INSERT INTO public.utsav_pledges (
  corridor_id, booking_ref, passenger_name, passenger_phone, passenger_cohort, boarding_point,
  seats, max_willing_fare, locked_unit_fare, platform_fee_unit, total_payable, estimated_saving, status
)
SELECT id, 'UTV-DL3318', 'Harshita Nadella (IIT-D AP Chapter)', '+91 94901 •••84', 'IIT / DU / JNU Student Wing',
       'IGI T2 Metro Concourse', 6, 15400, 9100, 410, 57060, 35340, 'allotment_confirmed'
FROM public.utsav_corridors WHERE code = 'DEL-VGA-SK27'
ON CONFLICT (booking_ref) DO NOTHING;

INSERT INTO public.utsav_pledges (
  corridor_id, booking_ref, passenger_name, passenger_phone, passenger_cohort, boarding_point,
  seats, max_willing_fare, locked_unit_fare, platform_fee_unit, total_payable, estimated_saving, status
)
SELECT id, 'UTV-VZ7720', 'Srinivasulu Kambhampati', '+91 89192 •••45', 'Vizag Steel / Naval Families',
       'NAD Junction → VTZ', 3, 16200, 7250, 326, 22728, 25872, 'allotment_confirmed'
FROM public.utsav_corridors WHERE code = 'VTZ-DEL-SK27'
ON CONFLICT (booking_ref) DO NOTHING;

INSERT INTO public.utsav_pledges (
  corridor_id, booking_ref, passenger_name, passenger_phone, passenger_cohort, boarding_point,
  seats, max_willing_fare, locked_unit_fare, platform_fee_unit, total_payable, estimated_saving, status
)
SELECT id, 'UTV-HY5129', 'Pranav Reddy & Cyberabad Cohort', '+91 90004 •••67', 'HITEC City Tech Commuters',
       'Gachibowli ORR Lounge', 5, 2950, 1150, 46, 5980, 8770, 'allotment_confirmed'
FROM public.utsav_corridors WHERE code = 'HYD-VGA-SK27'
ON CONFLICT (booking_ref) DO NOTHING;

INSERT INTO public.utsav_carrier_bids (
  corridor_id, corridor_code, carrier_name, desk_contact, offered_seats, net_group_fare,
  baggage_terms, hold_window_hours, notes, bid_status
)
SELECT id, 'VGA-DEL-SK27', 'Air India Group Desk (South)', 'groups.south@airindia-desk.in', 60, 6800,
       '25 kg + Free Name Entry up to T-72h', 96,
       '25% EMD deposit required on crossing 30 pax; balance at T-7 days.', 'accepted'
FROM public.utsav_corridors WHERE code = 'VGA-DEL-SK27' LIMIT 1;

INSERT INTO public.utsav_carrier_bids (
  corridor_id, corridor_code, carrier_name, desk_contact, offered_seats, net_group_fare,
  baggage_terms, hold_window_hours, notes, bid_status
)
SELECT id, 'DEL-VGA-SK27', 'IndiGo 6E Series Desk', 'series.north@goindigo-corp.in', 54, 6950,
       '15 kg + 7 kg; Student extra 10 kg add-on ₹450', 72,
       'Awaiting 3 more seats to trigger Tier-2 ₹7,800 slab release.', 'accepted'
FROM public.utsav_corridors WHERE code = 'DEL-VGA-SK27' LIMIT 1;

INSERT INTO public.utsav_carrier_bids (
  corridor_id, corridor_code, carrier_name, desk_contact, offered_seats, net_group_fare,
  baggage_terms, hold_window_hours, notes, bid_status
)
SELECT id, 'TIR-DEL-SK27', 'Akasa Air Group Sales', 'charterdesk@akasa-b2b.in', 48, 7700,
       '15 kg + Complimentary Hot Tiffin Box', 72,
       'Counter-offered ₹7,450 if cohort crosses 40 seats by Dec 28.', 'under_review'
FROM public.utsav_corridors WHERE code = 'TIR-DEL-SK27' LIMIT 1;

INSERT INTO public.utsav_corridor_requests (
  origin_city, dest_city, festival, mode, travel_window, requester_name, group_size, upvotes
) VALUES
('Rajahmundry (RJA)', 'New Delhi (DEL)', 'Sankranti 2027', 'flight',
 '10–13 Jan 2027 (1-Stop HYD Block)', 'Godavari NRI & Delhi Chapter', 18, 42),
('Chennai (Kilambakkam)', 'Nellore / Ongole / Vijayawada', 'Sankranti 2027', 'bus',
 '12 Jan 2027 Night Departure', 'OMR IT Telugu Sangham', 26, 37),
('New Delhi (DEL)', 'Visakhapatnam (VTZ)', 'Ugadi 2027', 'flight',
 '07–08 Apr 2027 Morning', 'RK Puram Andhra Association', 14, 24)
ON CONFLICT DO NOTHING;
