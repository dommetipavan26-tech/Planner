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
  created_at?: string;
}

export interface Pledge {
  id: string;
  corridor_id: string;
  booking_ref: string;
  passenger_name: string;
  passenger_phone: string;
  passenger_cohort: string;
  boarding_point: string;
  seats: number;
  max_willing_fare: number;
  locked_unit_fare: number;
  platform_fee_unit: number;
  total_payable: number;
  estimated_saving: number;
  status: PledgeStatus;
  created_at: string;
}

export interface CarrierBid {
  id: string;
  corridor_id: string | null;
  corridor_code: string;
  carrier_name: string;
  desk_contact: string;
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

export type DeskSource = 'live' | 'snapshot';

export type DeskStatus = 'connecting' | 'ready' | 'offline';

export interface TierBreakdown {
  label: string;
  min: number;
  fare: number;
  fee: number;
  landed: number;
  reached: boolean;
  next: boolean;
}

export interface PledgeQuote {
  unitFare: number;
  feePerSeat: number;
  landedPerSeat: number;
  total: number;
  savingPerSeat: number;
  totalSaving: number;
  surgeTotal: number;
  tierReached: number;
  seatsToNextTier: number;
  nextTierSaving: number;
}
