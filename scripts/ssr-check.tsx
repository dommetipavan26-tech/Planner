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
import { routeDescription, routeTitle } from '../src/lib/meta';
import { redact, reportEvent } from '../src/lib/telemetry';
import { teluguCoverage, teluguFestival, teluguFor } from '../src/lib/telugu';
import type { RouteMatch } from '../src/lib/router';
import type { DeskSession, Pledge } from '../src/lib/types';

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

/**
 * The heading outline of a rendered view, in document order.
 *
 * A page with no h1, or one that steps h1 → h3, is a page a screen-reader user
 * navigates differently from a sighted one. `npm run audit` catches this in the
 * prerendered documents; this catches it before a build exists, and for states
 * the prerender never shows (an empty filter result, an unknown route).
 */
function outline(name: string, html: string): void {
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  const ones = levels.filter((l) => l === 1).length;
  check(`${name} has exactly one h1`, ones === 1, `found ${ones}`);
  for (let i = 1; i < levels.length; i += 1) {
    const previous = levels[i - 1] ?? 1;
    const current = levels[i] ?? previous;
    if (current > previous + 1) {
      check(`${name} heading outline`, false, `jumps h${previous} → h${current}`);
      return;
    }
  }
  check(`${name} heading outline`, true);
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
    desk: DESK_FIXTURE,
    isWatched: (id: string) => id === first.id,
    signInDesk: async () => ({ ok: true, data: DESK_FIXTURE }),
    signOutDesk: async () => undefined,
    join: async () => ({ ok: true, data: firstPledge }),
    toggleWatch: async () => ({ ok: true, data: true }),
    upvote: async () => ({ ok: true, data: firstRequest }),
    submitBid: async () => ({ ok: true, data: firstBid }),
    submitRequest: async () => ({ ok: true, data: firstRequest }),
    reload: async () => undefined,
    ...overrides,
  };
}

/**
 * A signed-in carrier desk. The token is the 64 hex characters the ledger mints;
 * the fixture never needs to be valid, only shaped like one, because nothing in
 * the render path calls the ledger with it.
 */
const DESK_FIXTURE: DeskSession = {
  token: 'a'.repeat(64),
  carrierId: '42775634-5a33-4538-a89a-d27b00f16673',
  carrierName: 'Air India Group Desk (South)',
  deskRef: 'AI-SOUTH',
  deskContact: 'groups.south@airindia-desk.in',
  expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
};

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
  let detailHtml = '';
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
    if (corridor === SNAPSHOT_CORRIDORS[0]) detailHtml = detail;
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

  // The bid sheet is gated on a desk session, and the two states are different
  // documents: signed out asks for credentials, signed in asks for the block.
  const carriersSignedOut = render(
    <CarriersView ledger={mockLedger({ desk: null })} onToast={() => {}} sheetOpen />,
  );
  contains('Carrier desk signed out', carriersSignedOut, [
    'Sign in to the carrier desk',
    'Desk code',
    'Passcode',
  ]);
  check(
    'Signed-out desk cannot reach the bid form',
    !plain(carriersSignedOut).includes('Net group fare per seat') &&
      !plain(carriersSignedOut).includes('Submit bid'),
  );

  const carriersSignedIn = render(
    <CarriersView ledger={mockLedger()} onToast={() => {}} sheetOpen />,
  );
  contains('Carrier desk signed in', carriersSignedIn, [
    'Air India Group Desk (South)',
    'Net group fare per seat',
    'Hold window (hours)',
  ]);
  check(
    'The signed-in sheet does not ask the desk to retype its own identity',
    !plain(carriersSignedIn).includes('Carrier / desk') &&
      !plain(carriersSignedIn).includes('Desk contact'),
  );
  check(
    'A bid is attributed to its desk code, not to a desk email',
    SNAPSHOT_BIDS.every((b) => (b.desk_ref ? plain(carriers).includes(b.desk_ref) : true)) &&
      !plain(carriers).includes('@airindia-desk.in'),
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

  // 10. Heading outlines, including the states a prerender never shows.
  outline('board', board);
  outline('corridor detail', detailHtml);
  outline('unknown corridor', unknown);
  outline('trips', trips);
  outline('empty trips', emptyTrips);
  outline('carrier desk', carriers);
  outline('request board', requests);
  outline('not found', render(<NotFoundView corridors={SNAPSHOT_CORRIDORS} />));

  // 11. Route metadata. These two functions are what the prerender writes into
  //     <title> and <meta name="description">, and what the client sets after
  //     hydration — they have to agree, or adopting the markup flickers a
  //     different title into the tab.
  const ROUTE_NAMES: RouteMatch['name'][] = [
    'corridors',
    'corridor',
    'trips',
    'carriers',
    'requests',
    'notfound',
  ];
  for (const name of ROUTE_NAMES) {
    const route: RouteMatch = { name };
    const title = routeTitle(route);
    const description = routeDescription(route);
    check(
      `${name} metadata is title-shaped`,
      title.length > 0 && title.length <= 70 && title.includes('UtsavAir'),
      `"${title}" is ${title.length} characters`,
    );
    check(
      `${name} metadata is description-shaped`,
      description.length >= 50 &&
        description.length <= 320 &&
        !description.includes('NaN') &&
        !description.includes('undefined') &&
        !description.includes('××'),
      description.length >= 50 && description.length <= 320
        ? `contains a formatting artefact: ${description}`
        : `${description.length} characters, want 50–320`,
    );
  }
  for (const corridor of SNAPSHOT_CORRIDORS) {
    const route: RouteMatch = { name: 'corridor', code: corridor.code };
    const title = routeTitle(route, corridor);
    const description = routeDescription(route, corridor);
    check(
      `${corridor.code} metadata names the corridor`,
      title.includes(corridor.code) &&
        description.includes(`${corridor.pledged_seats} of ${corridor.total_allotment}`) &&
        !description.includes('××') &&
        !description.includes('NaN'),
      `"${title}" / "${description}"`,
    );
  }

  // 12. Render determinism. The prerender is only safe to hydrate if the same
  //     inputs produce the same markup twice — which rules out Date.now(),
  //     Math.random() and anything read from localStorage during render.
  const deterministicLedger = mockLedger();
  const firstPass = render(
    <CorridorsView ledger={deterministicLedger} onHold={() => {}} onWatch={() => {}} />,
  );
  const secondPass = render(
    <CorridorsView ledger={deterministicLedger} onHold={() => {}} onWatch={() => {}} />,
  );
  check('the board renders identically twice', firstPass === secondPass);

  // 13. Telemetry redaction. This is the only thing standing between an error
  //     message and a destination outside this app, so it is checked as directly
  //     as the rest of the render path: nothing identifying may survive it, and a
  //     message with nothing to hide must survive intact, or the telemetry is
  //     useless for debugging.
  const dirty =
    'pledge failed for ravi.kumar@example.com on 9849123456, device f0e1d2c3-b4a5-4697-8899-aabbccddeeff, token aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, ref UTV-AP9041';
  const cleaned = redact(dirty);
  check('telemetry strips an email address', !cleaned.includes('ravi.kumar@example.com'));
  check('telemetry strips a mobile number', !cleaned.includes('9849123456'));
  check('telemetry strips a device uuid', !cleaned.includes('f0e1d2c3-b4a5'));
  check('telemetry strips a session token', !cleaned.includes('aaaaaaaaaaaaaaaa'));
  check('telemetry strips a booking reference', !cleaned.includes('UTV-AP9041'));
  check(
    'telemetry keeps the shape of what happened',
    cleaned.includes('pledge failed for') &&
      cleaned.includes('[email]') &&
      cleaned.includes('[digits]') &&
      cleaned.includes('[id]') &&
      cleaned.includes('[token]') &&
      cleaned.includes('[ref]'),
    cleaned,
  );
  check(
    'telemetry leaves an ordinary message alone',
    redact('A block must offer between 10 and 400 seats.') ===
      'A block must offer between 10 and 400 seats.',
  );
  check(
    'telemetry caps what it sends',
    redact('x'.repeat(4000)).length === 180,
    `length ${redact('x'.repeat(4000)).length}`,
  );
  check(
    'telemetry is inert during a server render',
    (() => {
      // reportEvent must not throw or write anything when window is absent, which
      // is exactly the condition this script runs under.
      reportEvent('render_check_probe', { detail: 'no window here' });
      return true;
    })(),
  );

  // 14. Telugu place names. The dictionary is the only thing standing between a
  //     reader and a half-translated label, so both halves of its contract are
  //     checked: every city on the board has a Telugu name, and a label it does
  //     not know completely renders as nothing at all rather than partly.
  const cityLabels = [
    ...new Set(SNAPSHOT_CORRIDORS.flatMap((c) => [c.origin_city, c.dest_city])),
  ];
  const coverage = teluguCoverage(cityLabels);
  check(
    'every city on the board has a Telugu name',
    coverage.missing.length === 0,
    coverage.missing.length > 0 ? `missing: ${coverage.missing.join(', ')}` : `${coverage.covered.length} covered`,
  );
  check(
    'Telugu keeps the shape of the English label',
    teluguFor('Vijayawada (Amaravati)') === 'విజయవాడ (అమరావతి)' &&
      teluguFor('Guntur / Amaravati') === 'గుంటూరు / అమరావతి' &&
      teluguFor('New Delhi') === 'న్యూ ఢిల్లీ',
    String(teluguFor('Vijayawada (Amaravati)')),
  );
  check(
    'a half-known place name renders as nothing',
    teluguFor('Vijayawada (Nowhere)') === null && teluguFor('Nowhere') === null,
  );
  check(
    'every festival on the board has a Telugu name',
    SNAPSHOT_CORRIDORS.every((c) => teluguFestival(c.festival) !== null),
    SNAPSHOT_CORRIDORS.map((c) => `${c.festival}=${teluguFestival(c.festival)}`).join(' · '),
  );
  check(
    'the board renders Telugu under a lang attribute',
    board.includes('lang="te"') && board.includes('విజయవాడ'),
  );
  // detailHtml is the first corridor's own page, rendered in section 3 above.
  check(
    'a corridor page renders its endpoints in Telugu too',
    detailHtml.includes('lang="te"') && detailHtml.includes('విజయవాడ'),
  );

  console.log(
    `\n${checks - failures}/${checks} checks passed${failures ? ` · ${failures} FAILED` : ''}`,
  );
  if (failures > 0) {
    throw new Error(`${failures} render check(s) failed`);
  }
}

main();
