import { useMemo, useState } from 'react';
import { Link, corridorPath } from '../lib/router';
import { useNow } from '../hooks/useClock';
import type { Ledger, BidInput, Result } from '../hooks/useLedger';
import { compactRupees, number, pct, relativeTime, rupees } from '../lib/format';
import type { CarrierBid } from '../lib/types';
import {
  Button,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  Panel,
  Reveal,
  Segmented,
  SelectInput,
  Sheet,
  TextArea,
  TextInput,
  cn,
} from '../components/ui';
import {
  IconArrow,
  IconCheck,
  IconClock,
  IconHandshake,
  IconLuggage,
  IconSearch,
  IconShield,
  IconUsers,
} from '../components/icons';

type StatusFilter = 'all' | CarrierBid['bid_status'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function CarriersView({
  ledger,
  onToast,
}: {
  ledger: Ledger;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const now = useNow();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { bids, corridors } = ledger;

  const airFees = corridors.filter((c) => c.mode === 'flight').map((c) => c.platform_fee_pct);
  const coachFees = corridors.filter((c) => c.mode === 'bus').map((c) => c.platform_fee_pct);
  const airFee = airFees.length > 0 ? Math.max(...airFees) : null;
  const coachFee = coachFees.length > 0 ? Math.max(...coachFees) : null;

  // Fee exposure is priced at each corridor's own percentage, not a blanket rate.
  const acceptedFeeExposure = bids
    .filter((b) => b.bid_status === 'accepted')
    .reduce((sum, b) => {
      const matched = corridors.find((c) => c.code === b.corridor_code);
      return sum + b.net_group_fare * b.offered_seats * ((matched?.platform_fee_pct ?? 0) / 100);
    }, 0);

  const stats = useMemo(() => {
    const seats = bids.reduce((sum, b) => sum + b.offered_seats, 0);
    const weightedFare =
      seats > 0 ? bids.reduce((sum, b) => sum + b.net_group_fare * b.offered_seats, 0) / seats : 0;
    const accepted = bids.filter((b) => b.bid_status === 'accepted').length;
    const countered = bids.filter((b) => b.bid_status === 'countered').length;
    const review = bids.filter((b) => b.bid_status === 'under_review').length;
    const hold =
      bids.length > 0
        ? bids.reduce((sum, b) => sum + b.hold_window_hours, 0) / bids.length
        : 0;
    const carriers = new Set(bids.map((b) => b.carrier_name)).size;
    return { seats, weightedFare, accepted, countered, review, hold, carriers };
  }, [bids]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bids
      .filter((b) => (statusFilter === 'all' ? true : b.bid_status === statusFilter))
      .filter((b) =>
        q
          ? b.carrier_name.toLowerCase().includes(q) ||
            b.corridor_code.toLowerCase().includes(q) ||
            b.desk_contact.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [bids, statusFilter, query]);

  const submit = async (input: BidInput): Promise<Result<CarrierBid>> => {
    setSubmitting(true);
    const result = await ledger.submitBid(input);
    setSubmitting(false);
    if (result.ok && result.data) {
      setSheetOpen(false);
      onToast(
        result.simulated
          ? 'Bid recorded locally — Postgres is unreachable from this browser'
          : `Bid logged for ${result.data.corridor_code}`,
        result.simulated ? 'info' : 'success',
      );
    } else {
      onToast(result.error ?? 'The ledger rejected that bid.', 'error');
    }
    return result;
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:py-14">
      <header className="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-2.5">
          <Eyebrow>Supply side · published</Eyebrow>
          <h1 className="display text-[clamp(2rem,4.6vw,3.25rem)] text-ivory">Carrier desk</h1>
          <p className="text-[13.5px] leading-relaxed text-mist-dim">
            Every block on the board starts here: a carrier desk offers seats at a net group fare,
            states how long it will hold them, and names the baggage and name-change terms. Those rows
            live in Postgres next to the pledges they price, so the fare a traveller sees can always be
            traced to the bid that produced it.
          </p>
        </div>
        <Button variant="primary" onClick={() => setSheetOpen(true)} icon={<IconHandshake size={14} />}>
          Log a bid
        </Button>
      </header>

      <dl className="mt-8 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        <StatCell label="Bids logged" value={String(bids.length)} note={`${stats.carriers} carrier desks`} />
        <StatCell label="Seats offered" value={number(stats.seats)} note="across all live blocks" />
        <StatCell
          label="Weighted net fare"
          value={rupees(stats.weightedFare)}
          note="seat-weighted, all bids"
          tone="marigold"
        />
        <StatCell
          label="Mean hold window"
          value={`${Math.round(stats.hold)} h`}
          note="before the allotment lapses"
        />
        <StatCell
          label="Status"
          value={`${stats.accepted} accepted`}
          note={`${stats.review} under review · ${stats.countered} countered`}
          tone="jade"
        />
      </dl>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Bid status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'accepted', label: 'Accepted' },
            { value: 'under_review', label: 'Under review' },
            { value: 'countered', label: 'Countered' },
          ]}
        />
        <div className="relative w-full lg:w-72">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-faint"
          />
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Carrier, corridor or desk contact"
            aria-label="Search bids"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconSearch size={22} />}
            as="h2"
            title="No bid matches that filter"
            body="Carrier desks log bids as allotments are released for the festival window. Widen the filter, or log the bid you are holding."
            action={
              <div className="flex gap-2">
                {statusFilter !== 'all' || query ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStatusFilter('all');
                      setQuery('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
                <Button size="sm" variant="primary" onClick={() => setSheetOpen(true)}>
                  Log a bid
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid list-none gap-4 lg:grid-cols-2">
          {filtered.map((bid, i) => {
            const corridor = corridors.find((c) => c.code === bid.corridor_code);
            return (
              <Reveal key={bid.id} as="li" delay={Math.min(i, 5) * 45}>
                <Panel hover className="flex h-full flex-col gap-3.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-[14px] text-ivory">{bid.carrier_name}</span>
                      <span className="micro truncate text-mist-faint">{bid.desk_contact}</span>
                    </div>
                    <Chip
                      tone={
                        bid.bid_status === 'accepted'
                          ? 'jade'
                          : bid.bid_status === 'countered'
                            ? 'clay'
                            : 'marigold'
                      }
                      dot={bid.bid_status === 'under_review'}
                    >
                      {bid.bid_status.replace('_', ' ')}
                    </Chip>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {corridor ? (
                      <Link
                        to={corridorPath(corridor.code)}
                        className="micro inline-flex items-center gap-1.5 rounded-pill border border-line bg-night-850 px-2.5 py-1 text-mist transition-colors duration-200 hover:border-marigold/50 hover:text-marigold"
                      >
                        {corridor.code} <IconArrow size={11} />
                      </Link>
                    ) : (
                      <span className="micro rounded-pill border border-line bg-night-850 px-2.5 py-1 text-mist-dim">
                        {bid.corridor_code} · unmatched
                      </span>
                    )}
                    <span className="micro text-mist-faint">
                      logged {relativeTime(bid.created_at, now)}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniCell label="Seats" value={number(bid.offered_seats)} />
                    <MiniCell label="Net group fare" value={rupees(bid.net_group_fare)} tone="marigold" />
                    <MiniCell label="Hold window" value={`${bid.hold_window_hours} h`} />
                    <MiniCell
                      label={`Fee ${pct(corridor?.platform_fee_pct ?? 4.5, 1)}`}
                      value={rupees(
                        Math.round(bid.net_group_fare * ((corridor?.platform_fee_pct ?? 4.5) / 100)),
                      )}
                      tone="clay"
                    />
                  </dl>

                  <div className="flex flex-col gap-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                    <span className="inline-flex items-start gap-1.5">
                      <IconLuggage size={12} className="mt-0.5 shrink-0 text-mist-faint" />
                      {bid.baggage_terms}
                    </span>
                    {bid.notes ? (
                      <span className="inline-flex items-start gap-1.5">
                        <IconClock size={12} className="mt-0.5 shrink-0 text-mist-faint" />
                        {bid.notes}
                      </span>
                    ) : null}
                  </div>

                  {corridor ? (
                    <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-line-soft pt-3">
                      <span className="text-[11.5px] text-mist-faint">
                        Block on the board: {corridor.pledged_seats}/{corridor.total_allotment} pledged
                      </span>
                      <span className="tnum text-[12.5px] text-jade">
                        −{pct(
                          corridor.festival_surge_fare > 0
                            ? ((corridor.festival_surge_fare - bid.net_group_fare) /
                                corridor.festival_surge_fare) *
                                100
                            : 0,
                        )}{' '}
                        vs surge
                      </span>
                    </div>
                  ) : null}
                </Panel>
              </Reveal>
            );
          })}
        </ul>
      )}

      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 border-b border-line pb-3">
            <Eyebrow>What we ask a carrier for</Eyebrow>
            <h2 className="display text-[clamp(1.5rem,3vw,2rem)] text-ivory">
              Four terms, and nothing else
            </h2>
          </div>
          <ol className="flex list-none flex-col gap-3">
            {[
              {
                title: 'A hard allotment, not a soft quote',
                body: 'Seat count, cabin or berth layout, and a contract reference we can print on the corridor. If the allotment is withdrawable at will, we publish it as conditional and say so on the board.',
              },
              {
                title: 'A hold window we can commit to travellers',
                body: 'Typically 48–96 hours. It has to outlast the lock deadline we advertise, otherwise the cohort is being asked to pledge against inventory that can vanish mid-countdown.',
              },
              {
                title: 'Name-change terms in writing',
                body: 'Free swaps until T-72h on air, 6 hours on coach. Festival groups change constantly — a relative falls ill, a student’s exam shifts — and a rigid name policy turns a good fare into a support queue.',
              },
              {
                title: 'One settlement, one manifest',
                body: 'A single invoice against the block at manifest close, with the EMD schedule stated up front. This is what makes the slab price possible: the carrier trades distribution cost for load-factor certainty.',
              },
            ].map((item, i) => (
              <li key={item.title} className="flex gap-3">
                <span className="tnum micro mt-0.5 shrink-0 text-mist-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-ivory">{item.title}</span>
                  <span className="text-[12px] leading-relaxed text-mist-dim">{item.body}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 border-b border-line pb-3">
            <Eyebrow>What the carrier gets</Eyebrow>
            <h2 className="display text-[clamp(1.5rem,3vw,2rem)] text-ivory">
              Load factor, bought in one transaction
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
            {[
              {
                label: 'Guaranteed load factor',
                value: `${number(stats.seats)} seats`,
                note: 'offered across live bids — sold as blocks, not one seat at a time',
              },
              {
                label: 'Distribution cost',
                value: 'Zero',
                note: 'no OTA commission, no GDS segment fee, one manifest per departure',
              },
              {
                label: 'Revenue management',
                value: 'Intact',
                note: 'the block is contracted out of the surge inventory, not the walk-up tail',
              },
              {
                label: 'Our take',
                value: airFee ? pct(airFee, 1) : '—',
                note: `${coachFee ? pct(coachFee, 1) : '—'} on coach blocks — charged to the traveller, never netted off the carrier fare`,
              },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1 bg-night-900 px-4 py-4">
                <span className="micro text-mist-faint">{item.label}</span>
                <span className="tnum text-[19px] leading-none font-medium text-ivory">
                  {item.value}
                </span>
                <span className="text-[11px] leading-snug text-mist-faint">{item.note}</span>
              </div>
            ))}
          </div>
          <Panel className="flex flex-col gap-2 p-4">
            <span className="inline-flex items-center gap-2 text-[12.5px] text-mist">
              <IconShield size={14} className="text-jade" />
              Nothing on this desk is binding
            </span>
            <p className="text-[11.5px] leading-relaxed text-mist-faint">
              A bid row is an offer recorded against a corridor, not a contract. Blocks become live only
              when a contract reference is issued and the hold window covers the published lock
              deadline. Traveller money is held, never captured, until that point — total fee exposure
              across accepted bids today is{' '}
              <span className="tnum text-clay">{compactRupees(acceptedFeeExposure)}</span>{' '}
              if every offered seat converts.
            </p>
          </Panel>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-mist-faint">
            <li className="inline-flex items-center gap-1.5">
              <IconCheck size={12} className="text-jade" /> Bids are append-only from the anon key
            </li>
            <li className="inline-flex items-center gap-1.5">
              <IconCheck size={12} className="text-jade" /> Status changes are desk-side, never client-side
            </li>
            <li className="inline-flex items-center gap-1.5">
              <IconUsers size={12} className="text-jade" /> Realtime: a new bid appears on every open desk
            </li>
          </ul>
        </section>
      </div>

      <BidSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        corridors={corridors}
        onSubmit={submit}
        submitting={submitting}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

function StatCell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'jade' | 'marigold';
}) {
  return (
    <div className="flex flex-col gap-1 bg-night-900 px-4 py-4">
      <dt className="micro text-mist-faint">{label}</dt>
      <dd
        className={cn(
          'tnum text-[22px] leading-none font-medium',
          tone === 'jade' ? 'text-jade' : tone === 'marigold' ? 'text-marigold' : 'text-ivory',
        )}
      >
        {value}
      </dd>
      <dd className="text-[11px] leading-snug text-mist-faint">{note}</dd>
    </div>
  );
}

function MiniCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'marigold' | 'clay';
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="micro text-mist-faint">{label}</dt>
      <dd
        className={cn(
          'tnum text-[13.5px] leading-none',
          tone === 'marigold' ? 'text-marigold' : tone === 'clay' ? 'text-clay' : 'text-ivory',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

interface FormErrors {
  corridorCode?: string;
  carrierName?: string;
  deskContact?: string;
  offeredSeats?: string;
  netGroupFare?: string;
  holdWindowHours?: string;
}

function BidSheet({
  open,
  onClose,
  corridors,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  corridors: Array<{
    code: string;
    origin_city: string;
    dest_city: string;
    platform_fee_pct: number;
  }>;
  onSubmit: (input: BidInput) => Promise<Result<CarrierBid>>;
  submitting: boolean;
}) {
  const [corridorCode, setCorridorCode] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [deskContact, setDeskContact] = useState('');
  const [offeredSeats, setOfferedSeats] = useState(45);
  const [netGroupFare, setNetGroupFare] = useState(7200);
  const [baggageTerms, setBaggageTerms] = useState('');
  const [holdWindowHours, setHoldWindowHours] = useState(72);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const selected = corridors.find((c) => c.code === corridorCode);
  const feePct = selected?.platform_fee_pct ?? 4.5;

  const reset = () => {
    setCarrierName('');
    setDeskContact('');
    setBaggageTerms('');
    setNotes('');
    setErrors({});
  };

  const validate = (): FormErrors => {
    const found: FormErrors = {};
    if (!corridorCode) found.corridorCode = 'Pick the corridor this bid prices.';
    if (carrierName.trim().length < 3) found.carrierName = 'Carrier or desk name, at least 3 characters.';
    if (!EMAIL_RE.test(deskContact.trim())) found.deskContact = 'A reachable desk email address.';
    if (!Number.isFinite(offeredSeats) || offeredSeats < 10 || offeredSeats > 400)
      found.offeredSeats = 'Blocks run from 10 to 400 seats.';
    if (!Number.isFinite(netGroupFare) || netGroupFare < 100 || netGroupFare > 200000)
      found.netGroupFare = 'Net fare per seat, in rupees.';
    if (!Number.isFinite(holdWindowHours) || holdWindowHours < 6 || holdWindowHours > 336)
      found.holdWindowHours = 'Hold window between 6 and 336 hours.';
    return found;
  };

  const fee = Math.round(netGroupFare * (feePct / 100));
  const landed = netGroupFare + fee;

  const submit = async () => {
    const found = validate();
    setErrors(found);
    const firstInvalid = (
      [
        ['corridorCode', 'bid-corridor'],
        ['carrierName', 'bid-carrier'],
        ['deskContact', 'bid-contact'],
        ['offeredSeats', 'bid-seats'],
        ['netGroupFare', 'bid-fare'],
        ['holdWindowHours', 'bid-hold'],
      ] as const
    ).find(([key]) => found[key]);
    if (firstInvalid) {
      document.getElementById(firstInvalid[1])?.focus();
      return;
    }
    const result = await onSubmit({
      corridorCode,
      carrierName,
      deskContact,
      offeredSeats: Math.round(offeredSeats),
      netGroupFare: Math.round(netGroupFare),
      baggageTerms,
      holdWindowHours: Math.round(holdWindowHours),
      notes,
    });
    if (result.ok) reset();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a carrier bid"
      description="Offers are written to utsav_carrier_bids and appear on every open desk in realtime."
      width="max-w-2xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11.5px] leading-snug text-mist-dim">
            Landed to the traveller at this net fare:{' '}
            <span className="tnum text-marigold">{rupees(landed)}</span> ({rupees(netGroupFare)} +{' '}
            {rupees(fee)} fee at {pct(feePct, 1)}).
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" loading={submitting} onClick={() => void submit()}>
              Submit bid
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label="Corridor"
          htmlFor="bid-corridor"
          required
          error={errors.corridorCode}
          className="sm:col-span-2"
        >
          <SelectInput
            id="bid-corridor"
            value={corridorCode}
            invalid={Boolean(errors.corridorCode)}
            onChange={(e) => setCorridorCode(e.target.value)}
          >
            <option value="">Select a corridor on the board…</option>
            {corridors.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.origin_city} → {c.dest_city}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Carrier / desk" htmlFor="bid-carrier" required error={errors.carrierName}>
          <TextInput
            id="bid-carrier"
            value={carrierName}
            placeholder="Air India Group Desk (South)"
            invalid={Boolean(errors.carrierName)}
            onChange={(e) => setCarrierName(e.target.value)}
          />
        </Field>

        <Field
          label="Desk contact"
          htmlFor="bid-contact"
          required
          error={errors.deskContact}
          hint="not published"
        >
          <TextInput
            id="bid-contact"
            type="email"
            autoComplete="email"
            value={deskContact}
            placeholder="groups.south@carrier.in"
            invalid={Boolean(errors.deskContact)}
            onChange={(e) => setDeskContact(e.target.value)}
          />
        </Field>

        <Field label="Seats offered" htmlFor="bid-seats" required error={errors.offeredSeats}>
          <TextInput
            id="bid-seats"
            type="number"
            inputMode="numeric"
            min={10}
            max={400}
            value={Number.isFinite(offeredSeats) ? offeredSeats : ''}
            className="tnum"
            invalid={Boolean(errors.offeredSeats)}
            onChange={(e) => setOfferedSeats(Number(e.target.value))}
          />
        </Field>

        <Field label="Net group fare per seat" htmlFor="bid-fare" required error={errors.netGroupFare}>
          <TextInput
            id="bid-fare"
            type="number"
            inputMode="numeric"
            min={100}
            step={50}
            value={Number.isFinite(netGroupFare) ? netGroupFare : ''}
            className="tnum"
            invalid={Boolean(errors.netGroupFare)}
            onChange={(e) => setNetGroupFare(Number(e.target.value))}
          />
        </Field>

        <Field label="Hold window (hours)" htmlFor="bid-hold" required error={errors.holdWindowHours}>
          <TextInput
            id="bid-hold"
            type="number"
            inputMode="numeric"
            min={6}
            max={336}
            value={Number.isFinite(holdWindowHours) ? holdWindowHours : ''}
            className="tnum"
            invalid={Boolean(errors.holdWindowHours)}
            onChange={(e) => setHoldWindowHours(Number(e.target.value))}
          />
        </Field>

        <Field label="Baggage & terms" htmlFor="bid-baggage" hint="one line">
          <TextInput
            id="bid-baggage"
            value={baggageTerms}
            placeholder="25 kg + free name entry to T-72h"
            onChange={(e) => setBaggageTerms(e.target.value)}
          />
        </Field>

        <Field label="Notes for the desk" htmlFor="bid-notes" className="sm:col-span-2">
          <TextArea
            id="bid-notes"
            value={notes}
            rows={3}
            placeholder="EMD schedule, counter-offer conditions, standby coach…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Divider label="what this bid produces" />
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniCell label="Net fare" value={rupees(netGroupFare)} />
            <MiniCell label={`Fee ${pct(feePct, 1)}`} value={rupees(fee)} tone="clay" />
            <MiniCell label="Landed" value={rupees(landed)} tone="marigold" />
            <MiniCell
              label="Block value"
              value={compactRupees(landed * (Number.isFinite(offeredSeats) ? offeredSeats : 0))}
            />
          </dl>
        </div>

        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Submit bid
        </button>
      </form>
    </Sheet>
  );
}
