import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FN, TABLE, isConnectivityError, ledgerClient } from '../lib/supabase';
import {
  toBid,
  toBids,
  toCorridors,
  toPledge,
  toPledges,
  toPublicPledges,
  toRequest,
  toRequests,
  toWatch,
  toWatches,
} from '../lib/normalise';
import { activeNetFare, feeOn, landedPerSeat } from '../lib/format';
import { deviceId } from '../lib/device';
import type {
  CarrierBid,
  Corridor,
  CorridorRequest,
  LedgerSource,
  LedgerStatus,
  Pledge,
  PublicPledge,
  TravelMode,
  Watch,
} from '../lib/types';
import {
  SNAPSHOT_BIDS,
  SNAPSHOT_CORRIDORS,
  SNAPSHOT_REQUESTS,
  SNAPSHOT_ROSTER,
} from '../data/snapshot';

export interface LedgerEvent {
  id: number;
  at: number;
  text: string;
  tone: 'pledge' | 'tier' | 'supply' | 'system';
}

export interface LedgerTotals {
  corridors: number;
  seatsAllotted: number;
  seatsPledged: number;
  fillRate: number;
  gmv: number;
  fees: number;
  savings: number;
  tierLocked: number;
  deepestSaving: number;
}

export interface Result<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** True when the write could not reach Postgres and lives on this device only. */
  simulated?: boolean;
}

export interface JoinInput {
  corridorId: string;
  name: string;
  phone: string;
  cohort: string;
  boardingPoint: string;
  seats: number;
}

export interface BidInput {
  corridorCode: string;
  carrierName: string;
  deskContact: string;
  offeredSeats: number;
  netGroupFare: number;
  baggageTerms: string;
  holdWindowHours: number;
  notes: string;
}

export interface RequestInput {
  originCity: string;
  destCity: string;
  festival: string;
  mode: TravelMode;
  travelWindow: string;
  requesterName: string;
  groupSize: number;
}

export interface Ledger {
  corridors: Corridor[];
  bids: CarrierBid[];
  requests: CorridorRequest[];
  /** Public activity feed — projected rows, no phone numbers or device ids. */
  roster: PublicPledge[];
  mine: Pledge[];
  watches: Watch[];
  status: LedgerStatus;
  source: LedgerSource;
  events: LedgerEvent[];
  totals: LedgerTotals;
  device: string;
  isWatched: (corridorId: string) => boolean;
  join: (input: JoinInput) => Promise<Result<Pledge>>;
  toggleWatch: (corridor: Corridor) => Promise<Result<boolean>>;
  upvote: (requestId: string) => Promise<Result<CorridorRequest>>;
  submitBid: (input: BidInput) => Promise<Result<CarrierBid>>;
  submitRequest: (input: RequestInput) => Promise<Result<CorridorRequest>>;
  reload: () => Promise<void>;
}

const NO_EVENTS: LedgerEvent[] = [];

/**
 * The ledger hook. One channel, one device id, one source of truth.
 *
 * Reads start from the bundled snapshot so first paint never waits on the
 * network, then replace themselves with Postgres rows. Writes go to SECURITY
 * DEFINER functions; if the network is down they fall back to a local mirror and
 * say so on the receipt, rather than silently pretending to have booked a seat.
 */
export function useLedger(): Ledger {
  const device = useMemo(() => deviceId(), []);

  const [corridors, setCorridors] = useState<Corridor[]>(SNAPSHOT_CORRIDORS);
  const [bids, setBids] = useState<CarrierBid[]>(SNAPSHOT_BIDS);
  const [requests, setRequests] = useState<CorridorRequest[]>(SNAPSHOT_REQUESTS);
  const [roster, setRoster] = useState<PublicPledge[]>(SNAPSHOT_ROSTER);
  const [mine, setMine] = useState<Pledge[]>([]);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [status, setStatus] = useState<LedgerStatus>('connecting');
  const [source, setSource] = useState<LedgerSource>('snapshot');
  const [events, setEvents] = useState<LedgerEvent[]>(NO_EVENTS);

  const alive = useRef(true);
  const clientRef = useRef<Awaited<ReturnType<typeof ledgerClient>>>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const getClient = useCallback(async () => {
    if (clientRef.current !== null) return clientRef.current;
    const client = await ledgerClient();
    clientRef.current = client;
    return client;
  }, []);

  const emit = useCallback((text: string, tone: LedgerEvent['tone']) => {
    if (!alive.current) return;
    setEvents((prev) =>
      [{ id: Date.now() + Math.random(), at: Date.now(), text, tone }, ...prev].slice(0, 7),
    );
  }, []);

  /* ------------------------------------------------------------- reads */

  const readCorridors = useCallback(async () => {
    const client = await getClient();
    if (!client) return false;
    const { data, error } = await client
      .from(TABLE.corridor)
      .select('*')
      .order('departure_date', { ascending: true })
      .order('origin_code', { ascending: true });
    if (error || !alive.current) return false;
    setCorridors(toCorridors(data));
    return true;
  }, [getClient]);

  const readBids = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const { data, error } = await client
      .from(TABLE.bid)
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && alive.current) setBids(toBids(data));
  }, [getClient]);

  const readRequests = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const { data, error } = await client
      .from(TABLE.request)
      .select('*')
      .order('upvotes', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && alive.current) setRequests(toRequests(data));
  }, [getClient]);

  const readRoster = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    // Pledges carry no anonymous table policy: the public feed is a SECURITY
    // DEFINER projection that omits phone numbers, boarding points and device ids.
    const { data, error } = await client.rpc(FN.publicPledges, { p_limit: 12 });
    if (!error && alive.current) setRoster(toPublicPledges(data));
  }, [getClient]);

  const readMine = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const { data, error } = await client.rpc(FN.myPledges, { p_device_id: device });
    if (!error && alive.current) setMine(toPledges(data));
  }, [getClient, device]);

  const readWatches = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const { data, error } = await client.rpc(FN.myWatches, { p_device_id: device });
    if (!error && alive.current) setWatches(toWatches(data));
  }, [getClient, device]);

  const hydrate = useCallback(async () => {
    const ok = await readCorridors();
    if (ok) {
      await Promise.all([readBids(), readRequests(), readRoster(), readMine(), readWatches()]);
    }
    if (!alive.current) return;
    setStatus(ok ? 'ready' : 'offline');
    setSource(ok ? 'live' : 'snapshot');
  }, [readCorridors, readBids, readRequests, readRoster, readMine, readWatches]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /* ---------------------------------------------------------- realtime */

  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    let channel: unknown = null;
    let owner: Awaited<ReturnType<typeof ledgerClient>> = null;

    void (async () => {
      const client = await getClient();
      if (!client || cancelled) return;
      owner = client;

      channel = client
        .channel(`utsavair:${device}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: TABLE.corridor },
          (payload: { new: unknown }) => {
            const row = toCorridors([payload.new])[0];
            if (row) {
              const seats = row.pledged_seats;
              if (seats >= row.tier3_min)
                emit(`${row.code} reached Tier III at ${seats} seats`, 'tier');
              else if (seats >= row.tier2_min)
                emit(`${row.code} reached Tier II at ${seats} seats`, 'tier');
              else emit(`${row.code} moved to ${seats} pledged seats`, 'pledge');
            }
            // A pledge write always moves the corridor row, and pledge payloads
            // are withheld from anon by RLS — so the corridor update is the
            // signal, and the feed is re-read through its projection.
            void Promise.all([readCorridors(), readRoster(), readMine()]);
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: TABLE.bid },
          () => {
            emit('Carrier desk logged a new bid', 'supply');
            void readBids();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: TABLE.request },
          () => void readRequests(),
        )
        .subscribe((state: string) => {
          if (cancelled) return;
          if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
            if (channel && owner) void owner.removeChannel(channel);
            setStatus('offline');
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel && owner) void owner.removeChannel(channel);
    };
  }, [status, device, emit, getClient, readCorridors, readRoster, readMine, readBids, readRequests]);

  /* --------------------------------------------------------- mutations */

  const join = useCallback(
    async (input: JoinInput): Promise<Result<Pledge>> => {
      const corridor = corridors.find((c) => c.id === input.corridorId);
      if (!corridor) return { ok: false, error: 'That corridor is no longer on the board.' };
      if (input.seats < 1 || input.seats > 8)
        return { ok: false, error: 'A single pledge can hold between 1 and 8 seats.' };
      if (input.seats > corridor.total_allotment - corridor.pledged_seats)
        return {
          ok: false,
          error: `Only ${Math.max(0, corridor.total_allotment - corridor.pledged_seats)} seats are left in this block.`,
        };

      const client = await getClient();
      if (client) {
        const { data, error } = await client.rpc(FN.joinCohort, {
          p_corridor_id: input.corridorId,
          p_passenger_name: input.name,
          p_passenger_phone: input.phone,
          p_passenger_cohort: input.cohort,
          p_boarding_point: input.boardingPoint,
          p_seats: input.seats,
          p_device_id: device,
        });
        if (!error) {
          const pledge = toPledge(data as Record<string, unknown>);
          await Promise.all([readCorridors(), readMine(), readRoster()]);
          return { ok: true, data: pledge };
        }
        if (!isConnectivityError(error.message ?? '')) {
          return { ok: false, error: humanise(error.message ?? 'The ledger rejected that pledge.') };
        }
        // Otherwise fall through to the local mirror.
      }

      const projected = corridor.pledged_seats + input.seats;
      const net =
        projected >= corridor.tier3_min
          ? corridor.tier3_fare
          : projected >= corridor.tier2_min
            ? corridor.tier2_fare
            : corridor.tier1_fare;
      const fee = feeOn(net, corridor.platform_fee_pct);
      const local: Pledge = {
        id: `local-${Date.now()}`,
        corridor_id: corridor.id,
        booking_ref: `UTV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        passenger_name: input.name.trim(),
        passenger_phone: input.phone.trim(),
        passenger_cohort: input.cohort.trim() || 'General cohort',
        boarding_point: input.boardingPoint.trim(),
        seats: input.seats,
        max_willing_fare: corridor.festival_surge_fare,
        locked_unit_fare: net,
        platform_fee_unit: fee,
        total_payable: (net + fee) * input.seats,
        estimated_saving: Math.max(0, (corridor.festival_surge_fare - (net + fee)) * input.seats),
        status: projected >= corridor.tier1_min ? 'allotment_confirmed' : 'escrow_held',
        device_id: device,
        created_at: new Date().toISOString(),
      };
      setMine((prev) => [local, ...prev]);
      setRoster((prev) => [toFeedRow(local), ...prev].slice(0, 12));
      setCorridors((prev) =>
        prev.map((c) =>
          c.id === corridor.id
            ? {
                ...c,
                pledged_seats: projected,
                allotment_status:
                  projected >= c.tier3_min
                    ? 'tier3_locked'
                    : projected >= c.tier2_min
                      ? 'tier2_locked'
                      : projected >= c.tier1_min
                        ? 'tier1_locked'
                        : 'collecting',
              }
            : c,
        ),
      );
      return { ok: true, data: local, simulated: true };
    },
    [corridors, device, getClient, readCorridors, readMine, readRoster],
  );

  const isWatched = useCallback(
    (corridorId: string) => watches.some((w) => w.corridor_id === corridorId),
    [watches],
  );

  const toggleWatch = useCallback(
    async (corridor: Corridor): Promise<Result<boolean>> => {
      const watching = isWatched(corridor.id);
      const client = await getClient();

      if (client) {
        const fn = watching ? FN.unwatch : FN.watch;
        const { data, error } = await client.rpc(fn, {
          p_device_id: device,
          p_corridor_id: corridor.id,
        });
        if (!error) {
          if (watching) {
            setWatches((prev) => prev.filter((w) => w.corridor_id !== corridor.id));
            return { ok: true, data: false };
          }
          setWatches((prev) => [
            ...prev.filter((w) => w.corridor_id !== corridor.id),
            toWatch(data as Record<string, unknown>),
          ]);
          return { ok: true, data: true };
        }
        if (!isConnectivityError(error.message ?? '')) {
          return { ok: false, error: humanise(error.message ?? 'Could not update that watch.') };
        }
      }

      setWatches((prev) =>
        watching
          ? prev.filter((w) => w.corridor_id !== corridor.id)
          : [
              ...prev,
              {
                id: `local-watch-${corridor.id}`,
                device_id: device,
                corridor_id: corridor.id,
                created_at: new Date().toISOString(),
              },
            ],
      );
      return { ok: true, data: !watching, simulated: true };
    },
    [isWatched, getClient, device],
  );

  const upvote = useCallback(
    async (requestId: string): Promise<Result<CorridorRequest>> => {
      const client = await getClient();

      if (client) {
        const { data, error } = await client.rpc(FN.upvoteRequest, { p_request_id: requestId });
        if (!error) {
          const row = toRequest(data as Record<string, unknown>);
          setRequests((prev) =>
            [...prev.map((r) => (r.id === row.id ? row : r))].sort((a, b) => b.upvotes - a.upvotes),
          );
          return { ok: true, data: row };
        }
        if (!isConnectivityError(error.message ?? '')) {
          return { ok: false, error: humanise(error.message ?? 'Could not register that upvote.') };
        }
      }

      const target = requests.find((r) => r.id === requestId);
      if (!target) return { ok: false, error: 'That request is no longer listed.' };
      const bumped = { ...target, upvotes: target.upvotes + 1 };
      setRequests((prev) =>
        [...prev.map((r) => (r.id === requestId ? bumped : r))].sort((a, b) => b.upvotes - a.upvotes),
      );
      return { ok: true, data: bumped, simulated: true };
    },
    [getClient, requests],
  );

  const submitBid = useCallback(
    async (input: BidInput): Promise<Result<CarrierBid>> => {
      const corridor = corridors.find((c) => c.code === input.corridorCode);
      const payload = {
        corridor_id: corridor?.id ?? null,
        corridor_code: input.corridorCode,
        carrier_name: input.carrierName.trim(),
        desk_contact: input.deskContact.trim(),
        offered_seats: input.offeredSeats,
        net_group_fare: input.netGroupFare,
        baggage_terms: input.baggageTerms.trim() || 'Standard allowance',
        hold_window_hours: input.holdWindowHours,
        notes: input.notes.trim() || null,
        bid_status: 'under_review' as const,
      };

      const client = await getClient();
      if (client) {
        const { data, error } = await client.from(TABLE.bid).insert(payload).select('*').single();
        if (!error) {
          const row = toBid(data as Record<string, unknown>);
          setBids((prev) => [row, ...prev]);
          return { ok: true, data: row };
        }
        if (!isConnectivityError(error.message ?? '')) {
          return { ok: false, error: humanise(error.message ?? 'The ledger rejected that bid.') };
        }
      }

      const local: CarrierBid = { ...payload, id: `local-bid-${Date.now()}`, created_at: new Date().toISOString() };
      setBids((prev) => [local, ...prev]);
      return { ok: true, data: local, simulated: true };
    },
    [corridors, getClient],
  );

  const submitRequest = useCallback(
    async (input: RequestInput): Promise<Result<CorridorRequest>> => {
      const payload = {
        origin_city: input.originCity.trim(),
        dest_city: input.destCity.trim(),
        festival: input.festival,
        mode: input.mode,
        travel_window: input.travelWindow.trim(),
        requester_name: input.requesterName.trim(),
        group_size: input.groupSize,
        upvotes: 1,
      };

      const client = await getClient();
      if (client) {
        const { data, error } = await client.from(TABLE.request).insert(payload).select('*').single();
        if (!error) {
          const row = toRequest(data as Record<string, unknown>);
          setRequests((prev) => [row, ...prev]);
          return { ok: true, data: row };
        }
        if (!isConnectivityError(error.message ?? '')) {
          return { ok: false, error: humanise(error.message ?? 'The ledger rejected that request.') };
        }
      }

      const local: CorridorRequest = {
        ...payload,
        id: `local-req-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      setRequests((prev) => [local, ...prev]);
      return { ok: true, data: local, simulated: true };
    },
    [getClient],
  );

  const reload = useCallback(async () => {
    setStatus('connecting');
    await hydrate();
  }, [hydrate]);

  /* ------------------------------------------------------------ totals */

  const totals = useMemo<LedgerTotals>(() => {
    let seatsAllotted = 0;
    let seatsPledged = 0;
    let gmv = 0;
    let fees = 0;
    let savings = 0;
    let tierLocked = 0;
    let deepestSaving = 0;

    for (const c of corridors) {
      seatsAllotted += c.total_allotment;
      seatsPledged += c.pledged_seats;
      gmv += landedPerSeat(c) * c.pledged_seats;
      fees += feeOn(activeNetFare(c), c.platform_fee_pct) * c.pledged_seats;
      const perSeatSaving = Math.max(0, c.festival_surge_fare - landedPerSeat(c));
      savings += perSeatSaving * c.pledged_seats;
      deepestSaving = Math.max(deepestSaving, perSeatSaving);
      if (c.pledged_seats >= c.tier1_min) tierLocked += 1;
    }

    return {
      corridors: corridors.length,
      seatsAllotted,
      seatsPledged,
      fillRate: seatsAllotted > 0 ? (seatsPledged / seatsAllotted) * 100 : 0,
      gmv,
      fees,
      savings,
      tierLocked,
      deepestSaving,
    };
  }, [corridors]);

  return {
    corridors,
    bids,
    requests,
    roster,
    mine,
    watches,
    status,
    source,
    events,
    totals,
    device,
    isWatched,
    join,
    toggleWatch,
    upvote,
    submitBid,
    submitRequest,
    reload,
  };
}

/** Strip a locally-created pledge down to the public feed projection. */
function toFeedRow(p: Pledge): PublicPledge {
  return {
    id: p.id,
    corridor_id: p.corridor_id,
    booking_ref: p.booking_ref,
    passenger_name: p.passenger_name,
    passenger_cohort: p.passenger_cohort,
    seats: p.seats,
    max_willing_fare: p.max_willing_fare,
    locked_unit_fare: p.locked_unit_fare,
    platform_fee_unit: p.platform_fee_unit,
    total_payable: p.total_payable,
    estimated_saving: p.estimated_saving,
    status: p.status,
    created_at: p.created_at,
  };
}

function humanise(message: string): string {
  if (/exceed remaining/i.test(message))
    return 'That block has fewer seats left than you asked for. Lower the seat count and try again.';
  if (/between 1 and 8/i.test(message)) return 'A single pledge can hold between 1 and 8 seats.';
  if (/at least 3 characters/i.test(message))
    return 'Enter the lead passenger name as it appears on ID.';
  if (/10-digit mobile/i.test(message)) return 'A 10-digit Indian mobile number is required.';
  if (/corridor not found/i.test(message)) return 'This corridor was removed from the board.';
  if (/duplicate key/i.test(message)) return 'That entry already exists on the ledger.';
  return message;
}
