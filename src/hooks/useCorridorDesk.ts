import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RPC, TABLES, supabase } from '../lib/supabase';
import type {
  CarrierBid,
  Corridor,
  CorridorRequest,
  DeskSource,
  DeskStatus,
  Pledge,
} from '../lib/types';
import {
  SNAPSHOT_BIDS,
  SNAPSHOT_CORRIDORS,
  SNAPSHOT_PLEDGES,
  SNAPSHOT_REQUESTS,
} from '../data/snapshot';

export interface JoinPayload {
  corridorId: string;
  name: string;
  phone: string;
  cohort: string;
  boardingPoint: string;
  seats: number;
}

export interface BidPayload {
  corridorCode: string;
  carrierName: string;
  deskContact: string;
  offeredSeats: number;
  netGroupFare: number;
  baggageTerms: string;
  holdWindowHours: number;
  notes: string;
}

export interface RequestPayload {
  originCity: string;
  destCity: string;
  festival: string;
  mode: 'flight' | 'bus';
  travelWindow: string;
  requesterName: string;
  groupSize: number;
}

export interface LedgerResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  simulated?: boolean;
}

interface FeedEvent {
  at: number;
  text: string;
}

const ORDER_BY_DATE = 'departure_date';

export function useCorridorDesk() {
  const [corridors, setCorridors] = useState<Corridor[]>(SNAPSHOT_CORRIDORS);
  const [pledges, setPledges] = useState<Pledge[]>(SNAPSHOT_PLEDGES);
  const [bids, setBids] = useState<CarrierBid[]>(SNAPSHOT_BIDS);
  const [requests, setRequests] = useState<CorridorRequest[]>(SNAPSHOT_REQUESTS);
  const [status, setStatus] = useState<DeskStatus>('connecting');
  const [source, setSource] = useState<DeskSource>('snapshot');
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pushFeed = useCallback((text: string) => {
    if (!mounted.current) return;
    setFeed((prev) => [{ at: Date.now(), text }, ...prev].slice(0, 6));
  }, []);

  const loadCorridors = useCallback(async () => {
    const client = supabase();
    if (!client) throw new Error('no client');
    const { data, error } = await client
      .from(TABLES.corridors)
      .select('*')
      .order(ORDER_BY_DATE, { ascending: true })
      .order('origin_city', { ascending: true });
    if (error) throw error;
    if (!mounted.current) return;
    setCorridors((data ?? []) as Corridor[]);
  }, []);

  const loadPledges = useCallback(async () => {
    const client = supabase();
    if (!client) throw new Error('no client');
    const { data, error } = await client
      .from(TABLES.pledges)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);
    if (error) throw error;
    if (!mounted.current) return;
    setPledges((data ?? []) as Pledge[]);
  }, []);

  const loadBids = useCallback(async () => {
    const client = supabase();
    if (!client) throw new Error('no client');
    const { data, error } = await client
      .from(TABLES.bids)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!mounted.current) return;
    setBids((data ?? []) as CarrierBid[]);
  }, []);

  const loadRequests = useCallback(async () => {
    const client = supabase();
    if (!client) throw new Error('no client');
    const { data, error } = await client
      .from(TABLES.requests)
      .select('*')
      .order('upvotes', { ascending: false });
    if (error) throw error;
    if (!mounted.current) return;
    setRequests((data ?? []) as CorridorRequest[]);
  }, []);

  // Initial hydrate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = supabase();
      if (!client) {
        if (cancelled) return;
        setStatus('offline');
        setSource('snapshot');
        return;
      }
      try {
        await Promise.all([loadCorridors(), loadPledges(), loadBids(), loadRequests()]);
        if (cancelled) return;
        setStatus('ready');
        setSource('live');
      } catch {
        if (cancelled) return;
        setStatus('offline');
        setSource('snapshot');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCorridors, loadPledges, loadBids, loadRequests]);

  // Realtime: one channel, four tables.
  useEffect(() => {
    const client = supabase();
    if (!client || status !== 'ready') return;

    const channel = client
      .channel('utsav-corridor-desk')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.corridors },
        (payload) => {
          const row = payload.new as Partial<Corridor> | undefined;
          if (payload.eventType === 'UPDATE' && row?.code) {
            pushFeed(`${row.code} cohort moved to ${row.pledged_seats ?? 0} seats`);
          }
          void loadCorridors();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLES.pledges },
        (payload) => {
          const row = payload.new as Partial<Pledge> | undefined;
          if (row?.booking_ref) {
            pushFeed(`Pledge ${row.booking_ref} recorded · ${row.seats ?? 1} seat(s)`);
          }
          void loadPledges();
          void loadCorridors();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLES.bids },
        () => void loadBids(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.requests },
        () => void loadRequests(),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [status, loadCorridors, loadPledges, loadBids, loadRequests, pushFeed]);

  const joinCohort = useCallback(
    async (payload: JoinPayload): Promise<LedgerResult<Pledge>> => {
      const client = supabase();
      const corridor = corridors.find((c) => c.id === payload.corridorId);
      if (!corridor) return { ok: false, error: 'Corridor no longer on the board.' };

      if (client && source === 'live') {
        const { data, error } = await client.rpc(RPC.joinCohort, {
          p_corridor_id: payload.corridorId,
          p_passenger_name: payload.name,
          p_passenger_phone: payload.phone,
          p_passenger_cohort: payload.cohort,
          p_boarding_point: payload.boardingPoint,
          p_seats: payload.seats,
        });
        if (error) return { ok: false, error: humanise(error.message) };
        await Promise.all([loadCorridors(), loadPledges()]);
        return { ok: true, data: data as Pledge };
      }

      // Snapshot ledger: compute locally so the desk stays explorable offline.
      const projected = corridor.pledged_seats + payload.seats;
      const unitFare =
        projected >= corridor.tier3_min
          ? corridor.tier3_fare
          : projected >= corridor.tier2_min
            ? corridor.tier2_fare
            : corridor.tier1_fare;
      const fee = Math.round(unitFare * (corridor.platform_fee_pct / 100));
      const local: Pledge = {
        id: `local-${Date.now()}`,
        corridor_id: corridor.id,
        booking_ref: `UTV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        passenger_name: payload.name,
        passenger_phone: payload.phone,
        passenger_cohort: payload.cohort || 'General',
        boarding_point: payload.boardingPoint,
        seats: payload.seats,
        max_willing_fare: corridor.festival_surge_fare,
        locked_unit_fare: unitFare,
        platform_fee_unit: fee,
        total_payable: (unitFare + fee) * payload.seats,
        estimated_saving: Math.max(
          0,
          (corridor.festival_surge_fare - (unitFare + fee)) * payload.seats,
        ),
        status: projected >= corridor.tier1_min ? 'allotment_confirmed' : 'escrow_held',
        created_at: new Date().toISOString(),
      };
      setPledges((prev) => [local, ...prev]);
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
      pushFeed(`Pledge ${local.booking_ref} held locally (snapshot ledger)`);
      return { ok: true, data: local, simulated: true };
    },
    [corridors, source, loadCorridors, loadPledges, pushFeed],
  );

  const submitBid = useCallback(
    async (payload: BidPayload): Promise<LedgerResult<CarrierBid>> => {
      const client = supabase();
      const corridor = corridors.find((c) => c.code === payload.corridorCode);
      if (client && source === 'live') {
        const { data, error } = await client
          .from(TABLES.bids)
          .insert({
            corridor_id: corridor?.id ?? null,
            corridor_code: payload.corridorCode,
            carrier_name: payload.carrierName,
            desk_contact: payload.deskContact,
            offered_seats: payload.offeredSeats,
            net_group_fare: payload.netGroupFare,
            baggage_terms: payload.baggageTerms,
            hold_window_hours: payload.holdWindowHours,
            notes: payload.notes || null,
            bid_status: 'under_review',
          })
          .select('*')
          .single();
        if (error) return { ok: false, error: humanise(error.message) };
        await loadBids();
        return { ok: true, data: data as CarrierBid };
      }

      const local: CarrierBid = {
        id: `local-bid-${Date.now()}`,
        corridor_id: corridor?.id ?? null,
        corridor_code: payload.corridorCode,
        carrier_name: payload.carrierName,
        desk_contact: payload.deskContact,
        offered_seats: payload.offeredSeats,
        net_group_fare: payload.netGroupFare,
        baggage_terms: payload.baggageTerms,
        hold_window_hours: payload.holdWindowHours,
        notes: payload.notes || null,
        bid_status: 'under_review',
        created_at: new Date().toISOString(),
      };
      setBids((prev) => [local, ...prev]);
      return { ok: true, data: local, simulated: true };
    },
    [corridors, source, loadBids],
  );

  const submitRequest = useCallback(
    async (payload: RequestPayload): Promise<LedgerResult<CorridorRequest>> => {
      const client = supabase();
      if (client && source === 'live') {
        const { data, error } = await client
          .from(TABLES.requests)
          .insert({
            origin_city: payload.originCity,
            dest_city: payload.destCity,
            festival: payload.festival,
            mode: payload.mode,
            travel_window: payload.travelWindow,
            requester_name: payload.requesterName,
            group_size: payload.groupSize,
            upvotes: 1,
          })
          .select('*')
          .single();
        if (error) return { ok: false, error: humanise(error.message) };
        await loadRequests();
        return { ok: true, data: data as CorridorRequest };
      }

      const local: CorridorRequest = {
        id: `local-req-${Date.now()}`,
        origin_city: payload.originCity,
        dest_city: payload.destCity,
        festival: payload.festival,
        mode: payload.mode,
        travel_window: payload.travelWindow,
        requester_name: payload.requesterName,
        group_size: payload.groupSize,
        upvotes: 1,
        created_at: new Date().toISOString(),
      };
      setRequests((prev) => [local, ...prev]);
      return { ok: true, data: local, simulated: true };
    },
    [source, loadRequests],
  );

  const upvoteRequest = useCallback(
    async (id: string): Promise<LedgerResult<CorridorRequest>> => {
      const client = supabase();
      if (client && source === 'live') {
        const { data, error } = await client.rpc(RPC.upvoteRequest, { p_request_id: id });
        if (error) return { ok: false, error: humanise(error.message) };
        await loadRequests();
        return { ok: true, data: data as CorridorRequest };
      }
      let updated: CorridorRequest | undefined;
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          updated = { ...r, upvotes: r.upvotes + 1 };
          return updated;
        }),
      );
      return updated ? { ok: true, data: updated, simulated: true } : { ok: false, error: 'Not found' };
    },
    [source, loadRequests],
  );

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadCorridors(), loadPledges(), loadBids(), loadRequests()]);
      setStatus('ready');
      setSource('live');
    } catch {
      setStatus('offline');
      setSource('snapshot');
    }
  }, [loadCorridors, loadPledges, loadBids, loadRequests]);

  const totals = useMemo(() => {
    const seatsPledged = corridors.reduce((sum, c) => sum + c.pledged_seats, 0);
    const seatsAllotted = corridors.reduce((sum, c) => sum + c.total_allotment, 0);
    const gmv = corridors.reduce(
      (sum, c) => sum + landedFor(c) * c.pledged_seats,
      0,
    );
    const fees = corridors.reduce(
      (sum, c) => sum + feeFor(c) * c.pledged_seats,
      0,
    );
    const savings = corridors.reduce(
      (sum, c) => sum + Math.max(0, c.festival_surge_fare - landedFor(c)) * c.pledged_seats,
      0,
    );
    const locked = corridors.filter((c) => c.pledged_seats >= c.tier1_min).length;
    return {
      seatsPledged,
      seatsAllotted,
      gmv,
      fees,
      savings,
      locked,
      corridors: corridors.length,
    };
  }, [corridors]);

  return {
    corridors,
    pledges,
    bids,
    requests,
    status,
    source,
    feed,
    totals,
    joinCohort,
    submitBid,
    submitRequest,
    upvoteRequest,
    refresh,
  };
}

function landedFor(c: Corridor): number {
  const unit =
    c.pledged_seats >= c.tier3_min
      ? c.tier3_fare
      : c.pledged_seats >= c.tier2_min
        ? c.tier2_fare
        : c.tier1_fare;
  return Math.round(unit * (1 + c.platform_fee_pct / 100));
}

function feeFor(c: Corridor): number {
  const unit =
    c.pledged_seats >= c.tier3_min
      ? c.tier3_fare
      : c.pledged_seats >= c.tier2_min
        ? c.tier2_fare
        : c.tier1_fare;
  return Math.round(unit * (c.platform_fee_pct / 100));
}

function humanise(message: string): string {
  if (/exceed remaining/i.test(message))
    return 'That block has fewer seats left than you asked for. Reduce the seat count.';
  if (/between 1 and 8/i.test(message)) return 'A single pledge can hold 1 to 8 seats.';
  if (/Corridor not found/i.test(message)) return 'This corridor was removed from the board.';
  if (/Failed to fetch|fetch|network/i.test(message))
    return 'Postgres is unreachable from this browser. Check the connection and retry.';
  return message;
}
