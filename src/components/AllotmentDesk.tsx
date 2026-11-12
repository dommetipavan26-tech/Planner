import { useState } from 'react';
import type { CarrierBid, Corridor, DeskSource } from '../lib/types';
import { compactRupees, formatDateTime, landedPerSeat, rupees } from '../lib/format';
import type { BidPayload } from '../hooks/useCorridorDesk';
import { Button, Field, Panel, PanelHead, Select, Stat, Tag, TextInput, Textarea, useToast } from './ui';

const EMPTY: BidPayload = {
  corridorCode: '',
  carrierName: '',
  deskContact: '',
  offeredSeats: 45,
  netGroupFare: 7200,
  baggageTerms: '',
  holdWindowHours: 72,
  notes: '',
};

export function AllotmentDesk({
  corridors,
  bids,
  source,
  onSubmitBid,
}: {
  corridors: Corridor[];
  bids: CarrierBid[];
  source: DeskSource;
  onSubmitBid: (payload: BidPayload) => Promise<{ ok: boolean; error?: string; data?: CarrierBid; simulated?: boolean }>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<BidPayload>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const gmv = corridors.reduce((sum, c) => sum + landedPerSeat(c) * c.pledged_seats, 0);
  const feeRevenue = corridors.reduce(
    (sum, c) => sum + Math.round(activeUnit(c) * (c.platform_fee_pct / 100)) * c.pledged_seats,
    0,
  );
  const seatsUnderBlock = corridors.reduce((sum, c) => sum + c.total_allotment, 0);
  const seatsPledged = corridors.reduce((sum, c) => sum + c.pledged_seats, 0);
  const acceptedSeats = bids
    .filter((b) => b.bid_status === 'accepted')
    .reduce((sum, b) => sum + b.offered_seats, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.corridorCode) next.corridorCode = 'Pick the corridor this bid is for.';
    if (form.carrierName.trim().length < 3) next.carrierName = 'Carrier / fleet name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.deskContact.trim()))
      next.deskContact = 'A reachable group-desk email is required.';
    if (form.offeredSeats < 10) next.offeredSeats = 'Group contracts start at 10 seats.';
    if (form.netGroupFare < 100) next.netGroupFare = 'Enter the contracted net fare per seat.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const res = await onSubmitBid({
      ...form,
      carrierName: form.carrierName.trim(),
      deskContact: form.deskContact.trim(),
      baggageTerms: form.baggageTerms.trim() || 'Standard allowance',
      notes: form.notes.trim(),
    });
    setBusy(false);

    if (!res.ok) {
      toast.push({ tone: 'error', title: 'Bid not recorded', body: res.error });
      return;
    }
    toast.push({
      tone: 'ok',
      title: res.simulated ? 'Bid held in the snapshot ledger' : 'Bid logged to the allotment desk',
      body: `${form.carrierName} · ${form.offeredSeats} seats at ${rupees(form.netGroupFare)} on ${form.corridorCode}.`,
    });
    setForm(EMPTY);
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        <Cell>
          <Stat label="seats under block" value={seatsUnderBlock} sub={`${acceptedSeats} accepted by desk`} />
        </Cell>
        <Cell>
          <Stat label="seats pledged" value={seatsPledged} sub="across all live corridors" />
        </Cell>
        <Cell>
          <Stat label="cohort gmv" value={compactRupees(gmv)} sub="landed fare × pledged seats" />
        </Cell>
        <Cell>
          <Stat
            label="platform fee booked"
            value={compactRupees(feeRevenue)}
            sub="disclosed on every receipt"
            tone="marigold"
          />
        </Cell>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel>
            <PanelHead
              eyebrow="carrier side"
              title="Group desk bids & allotment ledger"
              aside={
                <Tag tone={source === 'live' ? 'verdant' : 'marigold'}>
                  {source === 'live' ? 'postgres · utsav_carrier_bids' : 'snapshot'}
                </Tag>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline-soft">
                    {['corridor', 'carrier / desk', 'seats', 'net fare', 'terms', 'status'].map((h) => (
                      <th key={h} className="micro px-4 py-2 font-semibold text-ink-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {bids.map((b) => (
                    <tr key={b.id} className="align-top transition-colors hover:bg-paper-2">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[11.5px] font-semibold tracking-[0.04em] text-ink">
                          {b.corridor_code}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-ink-300">
                          {formatDateTime(b.created_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[12.5px] font-semibold text-ink">{b.carrier_name}</p>
                        <p className="mt-0.5 break-all text-[11px] text-ink-400">{b.desk_contact}</p>
                      </td>
                      <td className="tnum px-4 py-3 font-mono text-[12.5px] text-ink">
                        {b.offered_seats}
                      </td>
                      <td className="tnum px-4 py-3 font-mono text-[12.5px] font-semibold text-ink">
                        {rupees(b.net_group_fare)}
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="text-[11.5px] leading-snug text-ink-500">{b.baggage_terms}</p>
                        <p className="mt-1 font-mono text-[10.5px] text-ink-400">
                          hold {b.hold_window_hours}h after lock
                        </p>
                        {b.notes ? (
                          <p className="mt-1.5 border-l-2 border-hairline pl-2 text-[11px] leading-snug text-ink-400">
                            {b.notes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Tag
                          tone={
                            b.bid_status === 'accepted'
                              ? 'verdant'
                              : b.bid_status === 'countered'
                                ? 'marigold'
                                : 'neutral'
                          }
                        >
                          {b.bid_status.replace('_', ' ')}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                  {bids.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                        No bids on the desk yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel className="h-full">
            <PanelHead eyebrow="supply intake" title="Log a carrier bid" />
            <form onSubmit={submit} className="space-y-3 px-4 py-4 sm:px-5" noValidate>
              <Field label="Corridor" error={errors.corridorCode}>
                <Select
                  value={form.corridorCode}
                  onChange={(e) => setForm((f) => ({ ...f, corridorCode: e.target.value }))}
                >
                  <option value="">Select a corridor block</option>
                  {corridors.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.origin_code} → {c.dest_code} · {c.departure_date}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Carrier / fleet" error={errors.carrierName}>
                <TextInput
                  value={form.carrierName}
                  onChange={(e) => setForm((f) => ({ ...f, carrierName: e.target.value }))}
                  placeholder="e.g. IndiGo 6E Series Desk"
                  invalid={Boolean(errors.carrierName)}
                />
              </Field>

              <Field label="Group desk contact" hint="email" error={errors.deskContact}>
                <TextInput
                  value={form.deskContact}
                  onChange={(e) => setForm((f) => ({ ...f, deskContact: e.target.value }))}
                  placeholder="groups.south@carrier-desk.in"
                  invalid={Boolean(errors.deskContact)}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Seats" error={errors.offeredSeats}>
                  <TextInput
                    type="number"
                    min={10}
                    max={300}
                    value={form.offeredSeats}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, offeredSeats: Number(e.target.value) }))
                    }
                    invalid={Boolean(errors.offeredSeats)}
                  />
                </Field>
                <Field label="Net fare" hint="₹ / seat" error={errors.netGroupFare}>
                  <TextInput
                    type="number"
                    min={100}
                    step={50}
                    value={form.netGroupFare}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, netGroupFare: Number(e.target.value) }))
                    }
                    invalid={Boolean(errors.netGroupFare)}
                  />
                </Field>
                <Field label="Hold" hint="hours">
                  <TextInput
                    type="number"
                    min={12}
                    max={240}
                    value={form.holdWindowHours}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, holdWindowHours: Number(e.target.value) }))
                    }
                  />
                </Field>
              </div>

              <Field label="Baggage & name-change terms">
                <TextInput
                  value={form.baggageTerms}
                  onChange={(e) => setForm((f) => ({ ...f, baggageTerms: e.target.value }))}
                  placeholder="15 kg + 7 kg · free name swap until T-72h"
                />
              </Field>

              <Field label="Desk note" hint="EMD, deposit, release terms">
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="25% EMD at 30 pax, balance at T-7 days."
                />
              </Field>

              <div className="flex items-center justify-between gap-3 border-t border-hairline-soft pt-3">
                <p className="text-[11px] leading-snug text-ink-400">
                  Bids are visible to the corridor desk and drive the tier ladder travelers see.
                </p>
                <Button type="submit" loading={busy}>
                  Log bid
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      </div>

      <Panel tone="flat">
        <PanelHead eyebrow="why a carrier says yes" title="The economics from the other side of the desk" />
        <div className="grid gap-px bg-hairline-soft sm:grid-cols-3">
          {[
            {
              k: 'Certain load factor, early',
              v: 'A festival block sold 45 days out converts a high-risk seat into committed revenue before retail yield management has to guess. Carriers trade price for certainty.',
            },
            {
              k: 'Zero distribution cost',
              v: 'No OTA commission, no GDS fee, no paid acquisition. One contract, one manifest, one settlement — instead of 60 retail transactions across four channels.',
            },
            {
              k: 'Ancillary attach',
              v: 'A named cohort of 45+ travelers is a measurable audience for meals, excess baggage, seat selection and lounge access, which is where carrier margin actually sits.',
            },
          ].map((item) => (
            <div key={item.k} className="bg-paper-2 px-4 py-3.5">
              <p className="micro text-ink-400">{item.k}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">{item.v}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="bg-paper-3 px-4 py-3.5">{children}</div>;
}

function activeUnit(c: Corridor): number {
  if (c.pledged_seats >= c.tier3_min) return c.tier3_fare;
  if (c.pledged_seats >= c.tier2_min) return c.tier2_fare;
  return c.tier1_fare;
}
