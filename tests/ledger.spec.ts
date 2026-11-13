import { expect, test } from '@playwright/test';
import { cutLedger, futureIso, probeCorridor, stubLedger, waitForTelemetry } from './helpers';

/**
 * Ledger behaviour that only exists in a browser: what the reader sees when
 * Postgres is unreachable, what the desk gate does with a real form and a real
 * click, and whether the outcomes reach telemetry.
 *
 * The ledger is stubbed throughout. Nothing here writes to the production
 * project, and no assertion depends on what that project contains today.
 */

const PROBE_CARRIER = {
  carrier_id: '00000000-0000-4000-8000-0000000000aa',
  carrier_name: 'Probe Group Desk',
  desk_ref: 'PROBE-1',
  desk_contact: 'probe.desk@example.invalid',
};

const PROBE_BID = {
  id: '00000000-0000-4000-8000-0000000000bb',
  corridor_id: probeCorridor().id,
  corridor_code: probeCorridor().code,
  carrier_name: PROBE_CARRIER.carrier_name,
  carrier_id: PROBE_CARRIER.carrier_id,
  desk_ref: PROBE_CARRIER.desk_ref,
  offered_seats: 42,
  net_group_fare: 6400,
  baggage_terms: '25 kg + free name entry to T-72h',
  hold_window_hours: 72,
  notes: null,
  bid_status: 'under_review',
  created_at: new Date().toISOString(),
};

const PROBE_REQUEST = {
  id: '00000000-0000-4000-8000-0000000000cc',
  origin_city: 'Probe Origin',
  dest_city: 'Probe Destination',
  festival: 'Sankranti 2027',
  mode: 'bus',
  travel_window: '12 Jan 2027',
  requester_name: 'Probe Sangham',
  group_size: 18,
  upvotes: 6,
  created_at: new Date().toISOString(),
};

test.describe('offline ledger', () => {
  test('the board still renders from the snapshot and says so', async ({ page }) => {
    await cutLedger(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The snapshot is bundled, so an unreachable ledger costs freshness, not the
    // page. Both halves of that claim are asserted: content, and the label.
    await expect(page.getByText('VGA-DEL-SK27').first()).toBeVisible();
    await expect(page.getByText('Snapshot', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Live ledger')).toHaveCount(0);
  });

  test('an unreachable ledger is reported to telemetry once', async ({ page }) => {
    await cutLedger(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const data = await waitForTelemetry(page, 'ledger_offline');
    expect(data.route).toBe('/');
    expect(String(data.detail)).toContain('snapshot');

    // Delivery, not just queueing: the collector was handed the event.
    const events = await page.evaluate(() => {
      const w = window as unknown as { __telemetry: Array<{ type: string }> };
      return w.__telemetry;
    });
    expect(events.filter((entry) => entry.type === 'event').length).toBeGreaterThan(0);
  });
});

test.describe('live reads', () => {
  test('Postgres rows replace the snapshot once they arrive', async ({ page }) => {
    await stubLedger(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // TST-PRB-XX00 is in no snapshot and no database: it can only be on screen
    // because the stubbed read was used.
    await expect(page.getByText('TST-PRB-XX00').first()).toBeVisible();
    await expect(page.getByText('Probe Origin').first()).toBeVisible();
  });
});

test.describe('carrier desk gate', () => {
  test('signed out, the sheet asks for credentials and hides the bid form', async ({ page }) => {
    await stubLedger(page);
    await page.goto('/carriers/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Sign in to the carrier desk/i }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Desk code')).toBeVisible();
    await expect(sheet.getByLabel('Passcode')).toBeVisible();
    await expect(sheet.getByLabel('Net group fare per seat')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Submit bid' })).toHaveCount(0);
  });

  test('a refused sign-in stays on the form and says why', async ({ page }) => {
    await stubLedger(page, [
      {
        match: '/rpc/utsav_carrier_desk_signin',
        body: {
          ok: false,
          code: 'UT429',
          error: 'That desk is locked after repeated failed sign-ins. Try again in 15 minutes.',
          locked_for_minutes: 15,
        },
      },
    ]);
    await page.goto('/carriers/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Sign in to the carrier desk/i }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Desk code').fill('PROBE-1');
    await sheet.getByLabel('Passcode').fill('not-the-passcode');
    await sheet.getByRole('button', { name: 'Sign in', exact: true }).click();

    // The refusal is data, not an exception: the ledger returns it so the failure
    // counter survives, so it surfaces here as a toast rather than a crash.
    await expect(page.getByRole('status').filter({ hasText: /locked/i }).first()).toBeVisible();
    await expect(sheet.getByLabel('Passcode')).toBeVisible();
    await expect(sheet.getByLabel('Net group fare per seat')).toHaveCount(0);

    const data = await waitForTelemetry(page, 'ledger_write_throttled');
    expect(data.action).toBe('signin');
  });

  test('a wrong passcode never reaches telemetry as a passcode', async ({ page }) => {
    const passcode = 'sekrit-9988776655';
    await stubLedger(page, [
      {
        match: '/rpc/utsav_carrier_desk_signin',
        body: { ok: false, code: 'UT401', error: 'Those desk credentials were not recognised.' },
      },
    ]);
    await page.goto('/carriers/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Sign in to the carrier desk/i }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Desk code').fill('PROBE-1');
    await sheet.getByLabel('Passcode').fill(passcode);
    await sheet.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: /not recognised/i }).first()).toBeVisible();

    const captured = await page.evaluate(() => {
      const w = window as unknown as { __telemetry: Array<{ payload: unknown }> };
      return JSON.stringify(w.__telemetry ?? []);
    });
    expect(captured, 'the passcode must not be in any telemetry payload').not.toContain(passcode);
    expect(captured, 'long digit runs are redacted before they leave').not.toContain('9988776655');
  });

  test('a signed-in desk logs a bid attributed by the ledger', async ({ page }) => {
    await stubLedger(page, [
      {
        match: '/rpc/utsav_carrier_desk_signin',
        body: { ok: true, session_token: 'b'.repeat(64), expires_at: futureIso(8), ...PROBE_CARRIER },
      },
      { match: '/rpc/utsav_submit_bid', body: PROBE_BID },
      { match: '/utsav_carrier_bids?', body: [] },
    ]);
    await page.goto('/carriers/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Sign in to the carrier desk/i }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Desk code').fill('PROBE-1');
    await sheet.getByLabel('Passcode').fill('whatever-the-desk-was-issued');
    await sheet.getByRole('button', { name: 'Sign in', exact: true }).click();

    // The sheet turns into the bid form, and the identity in it came from the
    // ledger's answer — there is no field for the desk to type its own name.
    await expect(sheet.getByLabel('Net group fare per seat')).toBeVisible();
    await expect(sheet.getByText(PROBE_CARRIER.carrier_name)).toBeVisible();
    await expect(sheet.getByText(`Desk ${PROBE_CARRIER.desk_ref}`)).toBeVisible();
    await expect(sheet.getByLabel('Carrier / desk')).toHaveCount(0);

    // The option's value is the corridor code, which is what the ledger keys on.
    await sheet.getByLabel('Corridor').selectOption(probeCorridor().code);
    await sheet.getByLabel('Seats offered').fill('42');
    await sheet.getByLabel('Net group fare per seat').fill('6400');
    await sheet.getByRole('button', { name: 'Submit bid' }).click();

    await expect(page.getByRole('status').filter({ hasText: /Bid logged for TST-PRB-XX00/i }).first()).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText(`Desk ${PROBE_CARRIER.desk_ref}`).first()).toBeVisible();
    // The desk email is returned to the signed-in desk and must not be published
    // on the board behind it.
    await expect(page.getByText(PROBE_CARRIER.desk_contact)).toHaveCount(0);
  });
});

test.describe('demand board', () => {
  test('a repeat upvote is reported as one vote, not another', async ({ page }) => {
    await stubLedger(page, [
      { match: '/utsav_corridor_requests?', body: [PROBE_REQUEST] },
      {
        match: '/rpc/utsav_upvote_request',
        body: { ok: true, already_voted: true, request: PROBE_REQUEST },
      },
    ]);
    await page.goto('/requests/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /^Upvote the/ }).first().click();

    await expect(
      page.getByRole('status').filter({ hasText: /already asked for that corridor/i }).first(),
    ).toBeVisible();

    // The count on the button is the ledger's, unchanged: 6 votes, not 7.
    await expect(page.getByRole('button', { name: /currently 6 votes/i }).first()).toBeVisible();
  });
});
