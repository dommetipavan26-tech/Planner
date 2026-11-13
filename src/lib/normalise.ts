import type {
  CarrierBid,
  Corridor,
  CorridorRequest,
  DeskSession,
  Pledge,
  PublicPledge,
  TravelMode,
  Watch,
} from './types';

/**
 * PostgREST returns `numeric` columns as strings and can hand back nulls where
 * the schema promises a value. Every row from the ledger passes through here so
 * the rest of the app can trust its types — one coercion boundary, no scattered
 * Number() calls in components.
 */

type Row = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = num(value, Number.NaN);
  return Number.isNaN(parsed) ? null : parsed;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function mode(value: unknown): TravelMode {
  return value === 'bus' ? 'bus' : 'flight';
}

export function toCorridor(row: Row): Corridor {
  return {
    id: str(row.id),
    code: str(row.code),
    festival: str(row.festival),
    origin_city: str(row.origin_city),
    origin_code: str(row.origin_code),
    origin_state: str(row.origin_state),
    dest_city: str(row.dest_city),
    dest_code: str(row.dest_code),
    dest_state: str(row.dest_state),
    mode: mode(row.mode),
    carrier_name: str(row.carrier_name),
    carrier_code: str(row.carrier_code),
    service_number: str(row.service_number),
    departure_date: str(row.departure_date),
    departure_time: str(row.departure_time),
    arrival_time: str(row.arrival_time),
    duration_label: str(row.duration_label),
    pickup_hub: str(row.pickup_hub),
    normal_fare: num(row.normal_fare),
    festival_surge_fare: num(row.festival_surge_fare),
    tier1_min: num(row.tier1_min, 15),
    tier1_fare: num(row.tier1_fare),
    tier2_min: num(row.tier2_min, 30),
    tier2_fare: num(row.tier2_fare),
    tier3_min: num(row.tier3_min, 45),
    tier3_fare: num(row.tier3_fare),
    platform_fee_pct: num(row.platform_fee_pct, 4.5),
    total_allotment: num(row.total_allotment),
    pledged_seats: num(row.pledged_seats),
    allotment_status: normaliseStatus(str(row.allotment_status)),
    lock_deadline: str(row.lock_deadline),
    contract_ref: str(row.contract_ref),
    baggage_allowance: str(row.baggage_allowance),
    cabin_or_berth: str(row.cabin_or_berth),
    boarding_points: list(row.boarding_points),
    manifest_deadline: strOrNull(row.manifest_deadline),
    refund_rule: str(row.refund_rule),
    amenities: list(row.amenities),
    lat: numOrNull(row.lat),
    lon: numOrNull(row.lon),
    dest_lat: numOrNull(row.dest_lat),
    dest_lon: numOrNull(row.dest_lon),
    created_at: strOrNull(row.created_at) ?? undefined,
    updated_at: strOrNull(row.updated_at) ?? undefined,
  };
}

function normaliseStatus(value: string): Corridor['allotment_status'] {
  switch (value) {
    case 'tier1_locked':
    case 'tier2_locked':
    case 'tier3_locked':
    case 'issued':
      return value;
    default:
      return 'collecting';
  }
}

function normalisePledgeStatus(value: string): Pledge['status'] {
  switch (value) {
    case 'allotment_confirmed':
    case 'released':
      return value;
    default:
      return 'escrow_held';
  }
}

export function toPublicPledge(row: Row): PublicPledge {
  return {
    id: str(row.id),
    corridor_id: str(row.corridor_id),
    booking_ref: str(row.booking_ref),
    passenger_name: str(row.passenger_name),
    passenger_cohort: str(row.passenger_cohort, 'General cohort'),
    seats: num(row.seats, 1),
    max_willing_fare: num(row.max_willing_fare),
    locked_unit_fare: num(row.locked_unit_fare),
    platform_fee_unit: num(row.platform_fee_unit),
    total_payable: num(row.total_payable),
    estimated_saving: num(row.estimated_saving),
    status: normalisePledgeStatus(str(row.status)),
    created_at: str(row.created_at),
  };
}

/** Owner-scoped row: the public projection plus the private fields. */
export function toPledge(row: Row): Pledge {
  return {
    ...toPublicPledge(row),
    passenger_phone: str(row.passenger_phone),
    boarding_point: str(row.boarding_point),
    device_id: strOrNull(row.device_id),
    fare_locked_at: strOrNull(row.fare_locked_at) ?? undefined,
  };
}

function normaliseBidStatus(value: string): CarrierBid['bid_status'] {
  switch (value) {
    case 'accepted':
    case 'countered':
      return value;
    default:
      return 'under_review';
  }
}

export function toBid(row: Row): CarrierBid {
  return {
    id: str(row.id),
    corridor_id: strOrNull(row.corridor_id),
    corridor_code: str(row.corridor_code),
    carrier_name: str(row.carrier_name),
    carrier_id: strOrNull(row.carrier_id),
    desk_ref: strOrNull(row.desk_ref),
    offered_seats: num(row.offered_seats),
    net_group_fare: num(row.net_group_fare),
    baggage_terms: str(row.baggage_terms),
    hold_window_hours: num(row.hold_window_hours, 72),
    notes: strOrNull(row.notes),
    bid_status: normaliseBidStatus(str(row.bid_status)),
    created_at: str(row.created_at),
  };
}

export function toRequest(row: Row): CorridorRequest {
  return {
    id: str(row.id),
    origin_city: str(row.origin_city),
    dest_city: str(row.dest_city),
    festival: str(row.festival),
    mode: mode(row.mode),
    travel_window: str(row.travel_window),
    requester_name: str(row.requester_name),
    group_size: num(row.group_size, 1),
    upvotes: num(row.upvotes, 0),
    created_at: str(row.created_at),
  };
}

/**
 * A desk sign-in answer, or a stored session, into a `DeskSession`.
 *
 * Returns null rather than a half-built object: a session without a 64-character
 * token or without an expiry is not a session this desk can write with, and the
 * caller has to be able to tell that from "not signed in".
 */
export function toDeskSession(row: Row | null | undefined): DeskSession | null {
  if (!row) return null;
  const token = str(row.session_token ?? row.token);
  const carrierId = str(row.carrier_id ?? row.carrierId);
  const expiresAt = str(row.expires_at ?? row.expiresAt);
  if (token.length !== 64 || !carrierId || Number.isNaN(Date.parse(expiresAt))) return null;
  if (Date.parse(expiresAt) <= Date.now()) return null;
  return {
    token,
    carrierId,
    carrierName: str(row.carrier_name ?? row.carrierName),
    deskRef: str(row.desk_ref ?? row.deskRef),
    deskContact: str(row.desk_contact ?? row.deskContact),
    expiresAt,
  };
}

export function toWatch(row: Row): Watch {
  return {
    id: str(row.id),
    device_id: str(row.device_id),
    corridor_id: str(row.corridor_id),
    created_at: str(row.created_at),
  };
}

export function toCorridors(rows: unknown): Corridor[] {
  return Array.isArray(rows) ? rows.map((r) => toCorridor(r as Row)) : [];
}

export function toPledges(rows: unknown): Pledge[] {
  return Array.isArray(rows) ? rows.map((r) => toPledge(r as Row)) : [];
}

export function toPublicPledges(rows: unknown): PublicPledge[] {
  return Array.isArray(rows) ? rows.map((r) => toPublicPledge(r as Row)) : [];
}

export function toBids(rows: unknown): CarrierBid[] {
  return Array.isArray(rows) ? rows.map((r) => toBid(r as Row)) : [];
}

export function toRequests(rows: unknown): CorridorRequest[] {
  return Array.isArray(rows) ? rows.map((r) => toRequest(r as Row)) : [];
}

export function toWatches(rows: unknown): Watch[] {
  return Array.isArray(rows) ? rows.map((r) => toWatch(r as Row)) : [];
}
