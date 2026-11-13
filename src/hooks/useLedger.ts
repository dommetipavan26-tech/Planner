import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FN,
  TABLE,
  THROTTLED_SQLSTATE,
  isAuthError,
  isConnectivityError,
  isMissingFunctionError,
  isThrottleError,
  ledgerClient,
} from '../lib/supabase';
import {
  toBid,
  toBids,
  toCorridors,
  toPledge,
  toDeskSession,
  toPledges,
  toPublicPledges,
  toRequest,
  toRequests,
  toWatch,
  toWatches,
} from '../lib/normalise';
import { activeNetFare, feeOn, landedPerSeat } from '../lib/format';
import { clearDeskSession, deviceId, readDeskSession, writeDeskSession } from '../lib/device';
import { reportEvent, reportLedgerOutcome } from '../lib/telemetry';
import type {
  CarrierBid,
  Corridor,
  CorridorRequest,
  DeskSession,
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
  /**
   * True when the ledger refused the *pace* rather than the pledge — a repeat
   * inside five seconds, or a thirteenth live pledge. The write did not happen,
   * so unlike `simulated` there is nothing local to show for it.
   */
  throttled?: boolean;
  /**
   * True when the pledge returned was already on the ledger: the server treats a
   * repeat of the same device, corridor, seat count and lead passenger inside
   * two minutes as a retry and hands back the row it wrote the first time. One
   * seat hold, however many times the button was pressed.
   */
  duplicate?: boolean;
}

export interface JoinInput {
  corridorId: string;
  name: string;
  phone: string;
  cohort: string;
  boardingPoint: string;
  seats: number;
}

/**
 * A bid, as the desk typed it. There is no carrier name and no desk contact in
 * here on purpose: `utsav_submit_bid` takes both from the session it was handed,
 * so a bid cannot claim to be from a desk that did not log it.
 */
export interface BidInput {
  corridorCode: string;
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

/** The writes telemetry classifies. One label per ledger mutation. */
export type LedgerAction = 'join' | 'bid' | 'request' | 'upvote' | 'watch' | 'signin';

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
  /** The signed-in carrier desk, or null. Only ever set from a ledger answer. */
  desk: DeskSession | null;
  isWatched: (corridorId: string) => boolean;
  signInDesk: (deskCode: string, passcode: string) => Promise<Result<DeskSession>>;
  signOutDesk: () => Promise<void>;
  join: (input: JoinInput) => Promise<Result<Pledge>>;
  toggleWatch: (corridor: Corridor) => Promise<Result<boolean>>;
  upvote: (requestId: string) => Promise<Result<CorridorRequest>>;
  submitBid: (input: BidInput) => Promise<Result<CarrierBid>>;
  submitRequest: (input: RequestInput) => Promise<Result<CorridorRequest>>;
  reload: () => Promise<void>;
}

const NO_EVENTS: LedgerEvent[] = [];

/**
 * Said when the browser cannot reach Postgres at all. Distinct from a refusal:
 * nothing was written, and nothing was mirrored locally either.
 */
const OFFLINE_MESSAGE = 'Cannot reach the ledger from this browser right now.';

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
  const [desk, setDesk] = useState<DeskSession | null>(null);
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

  /* ------------------------------------------------------ carrier desk */

  /**
   * Restore the desk session this tab stored, then ask the ledger whether it is
   * still live.
   *
   * It runs in an effect rather than in the state initialiser so that the server
   * render and the first client render both see `desk === null`: reading
   * sessionStorage during render would make hydration depend on browser state the
   * prerendered document cannot have.
   *
   * Only the ledger saying "that session has ended" clears it. An unreachable
   * ledger leaves the desk signed in, because logging a desk out over a dropped
   * connection would be the browser making a decision that belongs to Postgres.
   */
  useEffect(() => {
    const stored = readDeskSession();
    if (!stored) return;
    setDesk(stored);

    let cancelled = false;
    void (async () => {
      const client = await getClient();
      if (!client || cancelled) return;
      const { data, error } = await client.rpc(FN.carrierSession, {
        p_session_token: stored.token,
      });
      if (cancelled) return;
      if (error) {
        if (isAuthError(error)) {
          clearDeskSession();
          setDesk(null);
        }
        return;
      }
      const session = toDeskSession(data as Record<string, unknown>);
      if (!session) {
        clearDeskSession();
        setDesk(null);
        return;
      }
      writeDeskSession(session);
      setDesk(session);
    })();

    return () => {
      cancelled = true;
    };
  }, [getClient]);

  /**
   * Sign a desk in.
   *
   * `utsav_carrier_desk_signin` returns its refusals as data rather than raising
   * them, because raising would roll back the failed-attempt counter that drives
   * the fifteen-minute lockout after five failures. So `error` being null does not
   * mean success here — the `ok` flag in the payload does.
   */
  const signInDesk = useCallback(
    async (deskCode: string, passcode: string): Promise<Result<DeskSession>> => {
      const code = deskCode.trim();
      if (code.length < 3) return { ok: false, error: 'Enter the desk code operations issued.' };
      if (!passcode) return { ok: false, error: 'Enter the desk passcode.' };

      const client = await getClient();
      if (!client) return { ok: false, error: OFFLINE_MESSAGE };

      const { data, error } = await client.rpc(FN.carrierSignin, {
        p_desk_code: code,
        p_passcode: passcode,
        p_device_id: device,
      });

      if (error) {
        if (isConnectivityError(error.message ?? '') || isMissingFunctionError(error))
          return { ok: false, error: OFFLINE_MESSAGE };
        return { ok: false, error: humanise(error.message ?? 'That sign-in was refused.') };
      }

      const answer = (data ?? {}) as Record<string, unknown>;
      if (answer.ok !== true) {
        const message = typeof answer.error === 'string' ? answer.error : 'That sign-in was refused.';
        return {
          ok: false,
          error: humanise(message),
          throttled: answer.code === THROTTLED_SQLSTATE,
        };
      }

      const session = toDeskSession(answer);
      if (!session) return { ok: false, error: 'The ledger returned a session this desk cannot use.' };

      writeDeskSession(session);
      setDesk(session);
      emit(`${session.carrierName} signed in to the carrier desk`, 'supply');
      return { ok: true, data: session };
    },
    [device, emit, getClient],
  );

  /**
   * Sign the desk out. The local session goes first, so a failed revoke can never
   * leave this browser believing it is signed in; the ledger row is revoked on a
   * best-effort call and expires eight hours after issue either way.
   */
  const signOutDesk = useCallback(async () => {
    const current = desk;
    clearDeskSession();
    setDesk(null);
    if (!current) return;
    emit(`${current.carrierName} signed out of the carrier desk`, 'supply');

    const client = await getClient();
    if (!client) return;
    try {
      await client.rpc(FN.carrierSignout, { p_session_token: current.token });
    } catch {
      /* the token is gone locally and expires on the ledger regardless */
    }
  }, [desk, emit, getClient]);

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
    if (!ok) {
      // The reader still gets the snapshot and a status pill, but nobody looking
      // at the desk would otherwise know the ledger was unreachable.
      reportEvent('ledger_offline', { detail: 'corridor read failed; serving snapshot' });
    }
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
            reportEvent('realtime_channel_error', { state });
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
          // `mine` still holds the pre-call list, so a pledge id that is already
          // in it came back from the server's idempotent path rather than from
          // this call. Say so, or a retry reads as a second seat held.
          const duplicate = mine.some((p) => p.id === pledge.id);
          await Promise.all([readCorridors(), readMine(), readRoster()]);
          return { ok: true, data: pledge, duplicate };
        }
        if (isThrottleError(error)) {
          // Refused for pace. Nothing was written, so there is no local mirror
          // to fall back on and no seat to show.
          return {
            ok: false,
            throttled: true,
            error: humanise(error.message ?? 'Too many attempts from this device.'),
          };
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
    [corridors, device, getClient, mine, readCorridors, readMine, readRoster],
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
        // Two arguments since utsav_carrier_desk_v2_3: the vote is recorded per
        // (request, device), so a second press is a no-op the caller is told about
        // rather than another increment. The old one-argument version had no voter
        // identity and no limit, so one caller in a loop could manufacture demand
        // and re-order this board, which is what it ranks on.
        const { data, error } = await client.rpc(FN.upvoteRequest, {
          p_request_id: requestId,
          p_device_id: device,
        });
        if (!error) {
          const answer = (data ?? {}) as Record<string, unknown>;
          const row = toRequest((answer.request ?? {}) as Record<string, unknown>);
          if (!row.id) {
            return { ok: false, error: 'Could not register that upvote.' };
          }
          const already = answer.already_voted === true;
          setRequests((prev) =>
            [...prev.map((r) => (r.id === row.id ? row : r))].sort((a, b) => b.upvotes - a.upvotes),
          );
          return { ok: true, data: row, duplicate: already };
        }
        if (isThrottleError(error)) {
          return {
            ok: false,
            error: humanise(error.message ?? 'Wait a moment before upvoting another request.'),
            throttled: true,
          };
        }
        if (!isConnectivityError(error.message ?? '') && !isMissingFunctionError(error)) {
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
    [device, getClient, requests],
  );

  const submitBid = useCallback(
    async (input: BidInput): Promise<Result<CarrierBid>> => {
      if (!desk) {
        return { ok: false, error: 'Sign in to the carrier desk before logging a bid.' };
      }

      const client = await getClient();
      if (client) {
        const { data, error } = await client.rpc(FN.submitBid, {
          p_session_token: desk.token,
          p_corridor_code: input.corridorCode,
          p_offered_seats: input.offeredSeats,
          p_net_group_fare: input.netGroupFare,
          p_baggage_terms: input.baggageTerms.trim(),
          p_hold_window_hours: input.holdWindowHours,
          p_notes: input.notes.trim(),
        });

        if (!error) {
          const row = toBid(data as Record<string, unknown>);
          // A repeat of the same block inside two minutes comes back as the row the
          // ledger already wrote, so it replaces rather than duplicates.
          const known = bids.some((b) => b.id === row.id);
          setBids((prev) => (known ? prev.map((b) => (b.id === row.id ? row : b)) : [row, ...prev]));
          return { ok: true, data: row, duplicate: known };
        }

        if (isAuthError(error)) {
          // The ledger decides when a desk session ends, not this browser.
          clearDeskSession();
          setDesk(null);
          return { ok: false, error: 'That desk session has ended. Sign in again.' };
        }
        if (isThrottleError(error)) {
          return {
            ok: false,
            error: humanise(error.message ?? 'Wait a moment before logging another bid.'),
            throttled: true,
          };
        }
        if (!isConnectivityError(error.message ?? '') && !isMissingFunctionError(error)) {
          return { ok: false, error: humanise(error.message ?? 'The ledger rejected that bid.') };
        }
      }

      // Offline, or the ledger this browser reached does not have the function.
      // The row keeps the signed-in desk's own attribution and is reported as
      // simulated, so nobody reads a local mirror for a confirmed block.
      const local: CarrierBid = {
        id: `local-bid-${Date.now()}`,
        corridor_id: corridors.find((c) => c.code === input.corridorCode)?.id ?? null,
        corridor_code: input.corridorCode.trim().toUpperCase(),
        carrier_name: desk.carrierName,
        carrier_id: desk.carrierId,
        desk_ref: desk.deskRef || null,
        offered_seats: input.offeredSeats,
        net_group_fare: input.netGroupFare,
        baggage_terms: input.baggageTerms.trim() || 'Standard allowance',
        hold_window_hours: input.holdWindowHours,
        notes: input.notes.trim() || null,
        bid_status: 'under_review',
        created_at: new Date().toISOString(),
      };
      setBids((prev) => [local, ...prev]);
      return { ok: true, data: local, simulated: true };
    },
    [bids, corridors, desk, getClient],
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
        // The asker is the first person asking for it. The ledger forces this to
        // the submitter's own single vote: it used to be a client-supplied number
        // on an anon-insertable row, so a direct POST could list a request already
        // carrying whatever demand its author wanted it to appear to have.
        upvotes: 1,
      };

      const client = await getClient();
      if (client) {
        const { data, error } = await client.rpc(FN.submitRequest, {
          p_device_id: device,
          p_origin_city: payload.origin_city,
          p_dest_city: payload.dest_city,
          p_festival: payload.festival,
          p_mode: payload.mode,
          p_travel_window: payload.travel_window,
          p_requester_name: payload.requester_name,
          p_group_size: payload.group_size,
        });
        if (!error) {
          const row = toRequest(data as Record<string, unknown>);
          const known = requests.some((r) => r.id === row.id);
          setRequests((prev) => (known ? prev : [row, ...prev]));
          return { ok: true, data: row, duplicate: known };
        }
        if (isThrottleError(error)) {
          return {
            ok: false,
            error: humanise(error.message ?? 'Wait a moment before posting another request.'),
            throttled: true,
          };
        }
        if (!isConnectivityError(error.message ?? '') && !isMissingFunctionError(error)) {
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
    [device, getClient, requests],
  );

  const reload = useCallback(async () => {
    setStatus('connecting');
    await hydrate();
  }, [hydrate]);

  /* -------------------------------------------------------- telemetry */

  /**
   * Send every write outcome past telemetry on its way to the caller.
   *
   * Wrapping the returned functions rather than each `return` inside them means
   * a new failure path cannot forget to be reported: whatever a mutation resolves
   * to is classified here once. The refusals matter for support, but the
   * `simulated` ones matter more — that is the case where the desk looks like it
   * took a pledge and Postgres never heard about it.
   */
  const note = useCallback(<T,>(action: LedgerAction, result: Result<T>): Result<T> => {
    if (!result.ok) {
      reportLedgerOutcome(action, result.throttled ? 'throttled' : 'refused', result.error);
    } else if (result.simulated) {
      reportLedgerOutcome(action, 'simulated');
    } else if (result.duplicate) {
      reportLedgerOutcome(action, 'duplicate');
    }
    return result;
  }, []);

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
    desk,
    isWatched,
    signInDesk: (deskCode, passcode) => signInDesk(deskCode, passcode).then((r) => note('signin', r)),
    signOutDesk,
    join: (input) => join(input).then((r) => note('join', r)),
    toggleWatch: (corridor) => toggleWatch(corridor).then((r) => note('watch', r)),
    upvote: (requestId) => upvote(requestId).then((r) => note('upvote', r)),
    submitBid: (input) => submitBid(input).then((r) => note('bid', r)),
    submitRequest: (input) => submitRequest(input).then((r) => note('request', r)),
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
  /* Carrier desk. */
  if (/desk credentials were not recognised/i.test(message))
    return 'Those desk credentials were not recognised. Check the desk code and the passcode.';
  if (/locked after repeated failed sign-ins/i.test(message))
    return 'That desk is locked after repeated failed sign-ins. Try again in 15 minutes.';
  if (/desk is suspended/i.test(message))
    return 'That desk is suspended. Contact UtsavAir operations.';
  if (/desk session has ended/i.test(message)) return 'That desk session has ended. Sign in again.';
  if (/before logging another bid/i.test(message))
    return 'Give it a minute — this desk just logged a bid.';
  if (/has logged \d+ bids in the last hour/i.test(message))
    return 'This desk has logged six bids in the last hour. Wait before logging another.';

  /* Demand board. */
  if (/before posting another request/i.test(message))
    return 'Give it a minute — this device just posted a request.';
  if (/has posted \d+ requests in the last 24 hours/i.test(message))
    return 'This device has posted three requests in the last 24 hours. Upvote an existing one instead.';
  if (/before upvoting another request/i.test(message))
    return 'Give it a few seconds between upvotes.';
  if (/has upvoted \d+ requests in the last hour/i.test(message))
    return 'This device has upvoted twenty requests in the last hour. Come back later.';
  if (/group size must be between/i.test(message))
    return 'A request can be for between 1 and 200 travellers.';

  /* Pledges. */
  if (/wait a moment before holding again/i.test(message))
    return 'Give it a few seconds — this device just held a seat.';
  if (/already holds \d+ live pledges/i.test(message))
    return 'This device is holding as many seats as one device can. Release a pledge and try again.';
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
