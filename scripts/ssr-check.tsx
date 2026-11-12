/**
 * Render check. Builds the whole view tree to a string in Node — no DOM, no
 * effects — so anything that touches `window` during render, any undefined
 * property access on ledger data, and any type-level lie in the snapshot all
 * fail the build instead of failing in a reader's browser.
 *
 * Run with: npm run verify
 */
import { renderToString } from 'react-dom/server';
import type { ReactElement } from 'react';
import App from '../src/App';
import { RouterProvider } from '../src/lib/router';
import { ClockProvider } from '../src/hooks/useClock';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { CorridorsView } from '../src/views/CorridorsView';
import { CorridorView } from '../src/views/CorridorView';
import { TripsView } from '../src/views/TripsView';
import { CarriersView } from '../src/views/CarriersView';
import { RequestsView } from '../src/views/RequestsView';
import { NotFoundView } from '../src/views/NotFoundView';
import type { Ledger } from '../src/hooks/useLedger';
import {
  SNAPSHOT_BIDS,
  SNAPSHOT_CORRIDORS,
  SNAPSHOT_REQUESTS,
  SNAPSHOT_ROSTER,
} from '../src/data/snapshot';
import { activeNetFare, feeOn, landedPerSeat } from '../src/lib/format';
import type { Pledge } from '../src/lib/types';

/**
 * The public feed projection carries no phone number or boarding point, so the
 * owner-scoped trips view is exercised with a fixture built on top of a real
 * feed row — exactly the shape `utsav_my_pledges` returns.
 */
const FIXTURE_PHONE = '9848012312';

function ownerPledge(index: number): Pledge {
  const row = SNAPSHOT_ROSTER[index];
  if (!row) throw new Error('snapshot roster is empty');
  return {
    ...row,
    passenger_phone: FIXTURE_PHONE,
    boarding_point: 'Gannavaram Airport (VGA) · Group Desk B',
    device_id: 'device-check',
  };
}

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

/** JSX escapes ampersands; compare against the text a reader would see. */
function plain(html: string): string {
  return html.replaceAll('&amp;', '&');
}

function contains(name: string, rawHtml: string, needles: string[]): void {
  const html = plain(rawHtml);
  const missing = needles.filter((needle) => !html.includes(needle));
  check(name, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : '');
}

function mockLedger(overrides: Partial<Ledger> = {}): Ledger {
  const corridors = SNAPSHOT_CORRIDORS;
  const first = corridors[0];
  const firstPledge = ownerPledge(0);
  const firstBid = SNAPSHOT_BIDS[0];
  const firstRequest = SNAPSHOT_REQUESTS[0];
  if (!first || !firstPledge || !firstBid || !firstRequest) {
    throw new Error('snapshot fixture is incomplete');
  }

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
    const perSeat = Math.max(0, c.festival_surge_fare - landedPerSeat(c));
    savings += perSeat * c.pledged_seats;
    deepestSaving = Math.max(deepestSaving, perSeat);
    if (c.pledged_seats >= c.tier1_min) tierLocked += 1;
  }

  return {
    corridors,
    bids: SNAPSHOT_BIDS,
    requests: SNAPSHOT_REQUESTS,
    roster: SNAPSHOT_ROSTER,
    mine: [ownerPledge(0), ownerPledge(1)],
    watches: [
      {
        id: 'watch-check',
        device_id: 'device-check',
        corridor_id: first.id,
        created_at: new Date().toISOString(),
      },
    ],
    status: 'ready',
    source: 'live',
    events: [
      { id: 1, at: Date.now(), text: 'VGA-DEL-SK27 reached Tier II at 38 seats', tone: 'tier' },
    ],
    totals: {
      corridors: corridors.length,
      seatsAllotted,
      seatsPledged,
      fillRate: seatsAllotted > 0 ? (seatsPledged / seatsAllotted) * 100 : 0,
      gmv,
      fees,
      savings,
      tierLocked,
      deepestSaving,
    },
    device: 'f0e1d2c3-b4a5-4697-8899-aabbccddeeff',
    isWatched: (id: string) => id === first.id,
    join: async () => ({ ok: true, data: firstPledge }),
    toggleWatch: async () => ({ ok: true, data: true }),
    upvote: async () => ({ ok: true, data: firstRequest }),
    submitBid: async () => ({ ok: true, data: firstBid }),
    submitRequest: async () => ({ ok: true, data: firstRequest }),
    reload: async () => undefined,
    ...overrides,
  };
}

function render(node: ReactElement): string {
  return renderToString(
    <ErrorBoundary>
      <ClockProvider>
        <RouterProvider>{node}</RouterProvider>
      </ClockProvider>
    </ErrorBoundary>,
  );
}

function main(): void {
  console.log('UtsavAir render check\n');

  // 1. The whole app, through the router.
  const app = render(<App />);
  contains('App shell renders', app, ['UTSAVAIR', 'Corridors', 'My trips', 'Carriers', 'Requests']);
  check('App does not leak a React error boundary', !app.includes('could not render'));

  // 2. Board view with a live ledger.
  const board = render(<CorridorsView ledger={mockLedger()} onHold={() => {}} onWatch={() => {}} />);
  contains('Board renders every corridor code', board, SNAPSHOT_CORRIDORS.map((c) => c.code));
  contains('Board renders the pricing promise', board, [
    'Landed per seat',
    'Platform fee',
    'Three steps, and one of them is free',
    'The price is a function of the group',
    'One fee, stated on every figure',
    'What happens when it does not work out',
  ]);
  check('Board renders the routing diagram', board.includes('Routing diagram'));
  check(
    'Board renders no NaN or undefined text',
    !plain(board).includes('NaN') && !plain(board).includes('>undefined<'),
    board.includes('NaN') ? 'found NaN' : 'found a bare undefined',
  );

  // 3. Corridor detail for each seeded code.
  for (const corridor of SNAPSHOT_CORRIDORS) {
    const detail = render(
      <CorridorView
        code={corridor.code}
        ledger={mockLedger()}
        allCorridors={SNAPSHOT_CORRIDORS}
        onHold={() => {}}
        onWatch={() => {}}
      />,
    );
    contains(`${corridor.code} detail`, detail, [
      corridor.code,
      corridor.origin_code,
      corridor.dest_code,
      'Allotment map',
      'Refund & release rule',
      'Boarding points',
    ]);
    check(
      `${corridor.code} publishes its baggage and cabin terms`,
      detail.includes(corridor.baggage_allowance) && detail.includes(corridor.cabin_or_berth),
    );
    check(`${corridor.code} has no NaN`, !plain(detail).includes('NaN'));
  }

  // 4. Unknown corridor code degrades gracefully.
  const unknown = render(
    <CorridorView
      code="XXX-YYY-ZZ99"
      ledger={mockLedger()}
      allCorridors={SNAPSHOT_CORRIDORS}
      onHold={() => {}}
      onWatch={() => {}}
    />,
  );
  contains('Unknown corridor code', unknown, ['No corridor coded', 'Back to the board']);

  // 5. Trips, with and without pledges.
  const trips = render(<TripsView ledger={mockLedger()} onWatch={() => {}} onToast={() => {}} />);
  contains('Trips with pledges', trips, ['My trips', 'Seats held', 'Payable at lock']);
  check('Trips shows a booking reference', plain(trips).includes('UTV-'));
  check('Trips masks phone numbers', !trips.includes(FIXTURE_PHONE));
  check('Public feed never carries a phone number', !board.includes(FIXTURE_PHONE));

  const emptyTrips = render(
    <TripsView
      ledger={mockLedger({ mine: [], watches: [] })}
      onWatch={() => {}}
      onToast={() => {}}
    />,
  );
  contains('Trips empty state', emptyTrips, ['No pledges from this device yet']);

  // 6. Carrier desk and request board.
  const carriers = render(<CarriersView ledger={mockLedger()} onToast={() => {}} />);
  contains('Carrier desk', carriers, ['Carrier desk', 'Bids logged', 'Seats offered', 'Log a bid']);
  check(
    'Carrier desk lists every bid carrier',
    SNAPSHOT_BIDS.every((b) => plain(carriers).includes(b.carrier_name)),
  );

  const requests = render(
    <RequestsView ledger={mockLedger()} onToast={() => {}} onHold={() => {}} />,
  );
  contains('Request board', requests, [
    'Corridor requests',
    'How a request becomes a corridor',
    'Publish request',
  ]);
  check(
    'Request board lists every request',
    SNAPSHOT_REQUESTS.every((r) => plain(requests).includes(r.requester_name)),
  );

  // 7. Offline / snapshot mode still renders the board.
  const first = SNAPSHOT_CORRIDORS[0];
  if (!first) throw new Error('snapshot has no corridors');
  const offline = render(
    <CorridorsView
      ledger={mockLedger({ status: 'offline', source: 'snapshot' })}
      onHold={() => {}}
      onWatch={() => {}}
    />,
  );
  contains('Offline board still renders', offline, ['Live board', first.code]);

  // 8. 404.
  const notFound = render(<NotFoundView corridors={SNAPSHOT_CORRIDORS} />);
  contains('Not found', notFound, ['That route does not exist', 'Open corridors']);

  // 9. Every corridor carries the detail fields the UI promises.
  for (const c of SNAPSHOT_CORRIDORS) {
    check(
      `${c.code} snapshot is complete`,
      c.boarding_points.length > 0 &&
        c.amenities.length > 0 &&
        c.refund_rule.length > 10 &&
        c.cabin_or_berth.length > 3 &&
        c.manifest_deadline !== null &&
        c.lat !== null &&
        c.lon !== null &&
        c.dest_lat !== null &&
        c.dest_lon !== null &&
        c.tier1_min < c.tier2_min &&
        c.tier2_min < c.tier3_min &&
        c.tier3_min <= c.total_allotment &&
        c.pledged_seats <= c.total_allotment &&
        c.tier1_fare > c.tier2_fare &&
        c.tier2_fare > c.tier3_fare &&
        c.festival_surge_fare > c.tier1_fare,
    );
  }

  console.log(
    `\n${checks - failures}/${checks} checks passed${failures ? ` · ${failures} FAILED` : ''}`,
  );
  if (failures > 0) {
    throw new Error(`${failures} render check(s) failed`);
  }
}

main();
