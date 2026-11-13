export type TravelMode = 'flight' | 'bus';

export type AllotmentStatus =
  | 'collecting'
  | 'tier1_locked'
  | 'tier2_locked'
  | 'tier3_locked'
  | 'issued';

export type PledgeStatus = 'escrow_held' | 'allotment_confirmed' | 'released';

export type BidStatus = 'under_review' | 'accepted' | 'countered';

export interface Corridor {
  id: string;
  code: string;
  festival: string;
  origin_city: string;
  origin_code: string;
  origin_state: string;
  dest_city: string;
  dest_code: string;
  dest_state: string;
  mode: TravelMode;
  carrier_name: string;
  carrier_code: string;
  service_number: string;
  departure_date: string;
  departure_time: string;
  arrival_time: string;
  duration_label: string;
  pickup_hub: string;
  normal_fare: number;
  festival_surge_fare: number;
  tier1_min: number;
  tier1_fare: number;
  tier2_min: number;
  tier2_fare: number;
  tier3_min: number;
  tier3_fare: number;
  platform_fee_pct: number;
  total_allotment: number;
  pledged_seats: number;
  allotment_status: AllotmentStatus;
  lock_deadline: string;
  contract_ref: string;
  baggage_allowance: string;
  cabin_or_berth: string;
  boarding_points: string[];
  manifest_deadline: string | null;
  refund_rule: string;
  amenities: string[];
  lat: number | null;
  lon: number | null;
  dest_lat: number | null;
  dest_lon: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * What the public activity feed is allowed to show. `utsav_public_pledges`
 * projects exactly these columns — no phone number, no boarding point, no device
 * id — so a snapshot of the feed can never carry more than the live one does.
 */
export interface PublicPledge {
  id: string;
  corridor_id: string;
  booking_ref: string;
  passenger_name: string;
  passenger_cohort: string;
  seats: number;
  max_willing_fare: number;
  locked_unit_fare: number;
  platform_fee_unit: number;
  total_payable: number;
  estimated_saving: number;
  status: PledgeStatus;
  created_at: string;
}

/** The owner's own row, read back through `utsav_my_pledges`. */
export interface Pledge extends PublicPledge {
  passenger_phone: string;
  boarding_point: string;
  device_id?: string | null;
  fare_locked_at?: string;
}

export interface CarrierBid {
  id: string;
  corridor_id: string | null;
  corridor_code: string;
  carrier_name: string;
  /**
   * The desk that logged this bid, set by `utsav_submit_bid` from its session and
   * never taken from the caller. Null on rows logged before desks existed.
   */
  carrier_id: string | null;
  /**
   * Public desk code, e.g. `AI-SOUTH`. This replaced `desk_contact`, a desk email
   * address that sat in a table whose SELECT policy is `true` — world-readable —
   * while the bid form told the carrier the field was not published.
   */
  desk_ref: string | null;
  offered_seats: number;
  net_group_fare: number;
  baggage_terms: string;
  hold_window_hours: number;
  notes: string | null;
  bid_status: BidStatus;
  created_at: string;
}

export interface CorridorRequest {
  id: string;
  origin_city: string;
  dest_city: string;
  festival: string;
  mode: TravelMode;
  travel_window: string;
  requester_name: string;
  group_size: number;
  upvotes: number;
  created_at: string;
}

export interface Watch {
  id: string;
  device_id: string;
  corridor_id: string;
  created_at: string;
}

/**
 * A signed-in carrier desk.
 *
 * The token is a bearer credential for that desk's own writes and nothing else.
 * It lives in sessionStorage, so a desk session ends with the tab rather than
 * outliving a shared machine, and it is validated against the ledger on load —
 * being stored is not evidence of being live. `deskContact` is returned to the
 * signed-in desk by `utsav_carrier_desk_signin` and is not on any public row.
 */
export interface DeskSession {
  token: string;
  carrierId: string;
  carrierName: string;
  deskRef: string;
  deskContact: string;
  expiresAt: string;
}

export type LedgerSource = 'live' | 'snapshot';

export type LedgerStatus = 'connecting' | 'ready' | 'offline';

export interface Tier {
  id: 1 | 2 | 3;
  label: string;
  min: number;
  net: number;
  fee: number;
  landed: number;
  reached: boolean;
  next: boolean;
}

export interface Quote {
  unitFare: number;
  feePerSeat: number;
  landedPerSeat: number;
  total: number;
  savingPerSeat: number;
  totalSaving: number;
  surgeTotal: number;
  tierReached: 1 | 2 | 3;
  seatsToNextTier: number;
  nextTierLanded: number | null;
  nextTierSaving: number;
}
