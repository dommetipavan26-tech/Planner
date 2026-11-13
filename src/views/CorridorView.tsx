import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, corridorPath } from '../lib/router';
import { routeTitle } from '../lib/meta';
import { useCoarseNow } from '../hooks/useClock';
import { rememberCode } from '../lib/device';
import type { Ledger } from '../hooks/useLedger';
import {
  activeTier,
  daysUntil,
  feeOn,
  formatDate,
  formatDateYear,
  formatStamp,
  initials,
  isClosed,
  isFull,
  landedPerSeat,
  msUntil,
  netFareAt,
  pct,
  pluralise,
  relativeTime,
  rupees,
  savingPerSeat,
  seatsLeft,
  surgeMultiple,
} from '../lib/format';
import type { Corridor } from '../lib/types';
import { teluguFor } from '../lib/telugu';
import {
  Button,
  Chip,
  Countdown,
  Divider,
  EmptyState,
  Eyebrow,
  Panel,
  Reveal,
  Skeleton,
  Stepper,
  cn,
} from '../components/ui';
import { LandedFigure, PriceAnatomy, TierLadder } from '../components/Pricing';
import { statusLabel, statusTone } from '../components/CorridorCard';
import {
  IconArrow,
  IconBell,
  IconBellOff,
  IconBus,
  IconCheck,
  IconClock,
  IconLuggage,
  IconPin,
  IconPlane,
  IconShield,
  IconTicket,
  IconUsers,
} from '../components/icons';

export function CorridorView({
  code,
  ledger,
  onHold,
  onWatch,
  allCorridors,
}: {
  code: string;
  ledger: Ledger;
  onHold: (corridor: Corridor) => void;
  onWatch: (corridor: Corridor) => void;
  allCorridors: Corridor[];
}) {
  const now = useCoarseNow();
  const corridor = useMemo(
    () => allCorridors.find((c) => c.code.toLowerCase() === code.toLowerCase()),
    [allCorridors, code],
  );
  const [previewSeats, setPreviewSeats] = useState(2);

  useEffect(() => {
    if (corridor) rememberCode(corridor.code);
  }, [corridor]);

  useEffect(() => {
    if (!corridor) return;
    const previous = document.title;
    // Same function the prerender used to write <title>, so adopting this page's
    // markup never flickers a different string in the tab.
    document.title = routeTitle({ name: 'corridor', code: corridor.code }, corridor);
    return () => {
      document.title = previous;
    };
  }, [corridor]);

  if (ledger.status === 'connecting' && !corridor) {
    return <CorridorSkeleton />;
  }

  if (!corridor) {
    return <UnknownCorridor code={code} corridors={allCorridors} />;
  }

  const closed = isClosed(corridor, now);
  const full = isFull(corridor);
  const ModeIcon = corridor.mode === 'bus' ? IconBus : IconPlane;
  const pledges = ledger.roster.filter((p) => p.corridor_id === corridor.id);
  const bids = ledger.bids.filter((b) => b.corridor_code === corridor.code);
  const watched = ledger.isWatched(corridor.id);

  const projected = corridor.pledged_seats + previewSeats;
  const projectedNet = netFareAt(corridor, projected);
  const projectedFee = feeOn(projectedNet, corridor.platform_fee_pct);
  const projectedLanded = projectedNet + projectedFee;

  const similar = allCorridors
    .filter(
      (c) =>
        c.id !== corridor.id &&
        (c.dest_code === corridor.dest_code || c.origin_code === corridor.origin_code) &&
        !isFull(c),
    )
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex items-center gap-2 text-[11.5px] text-mist-faint">
          <li>
            <Link to="/" className="transition-colors duration-200 hover:text-mist">
              Corridors
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="micro text-mist-dim" aria-current="page">
              {corridor.code}
            </span>
          </li>
        </ol>
      </nav>

      {/* Route header */}
      <header className="relative overflow-hidden rounded-card border border-line bg-night-900 shadow-panel">
        <div className="glow-marigold pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 p-5 sm:p-7">
          {/* The visible title of this page is the pair of oversized endpoint
              codes below, which are spans: a screen-reader user would otherwise
              reach the sections' h2s with no page heading above them. This names
              the page for assistive tech without repeating what the codes
              already show, so it is clipped rather than displayed. */}
          <h1 className="sr-only">
            {corridor.code}: {corridor.origin_city} to {corridor.dest_city},{' '}
            {corridor.mode === 'bus' ? 'coach' : 'flight'} block,{' '}
            {formatDateYear(corridor.departure_date)}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={statusTone(corridor, now)} dot={!closed && !full}>
              {statusLabel(corridor, now)}
            </Chip>
            <Chip tone="neutral">
              {corridor.mode === 'bus' ? 'Coach block' : 'Air block'}
            </Chip>
            <span className="micro text-mist-faint">{corridor.festival}</span>
            <span className="micro ml-auto text-mist-faint">{corridor.contract_ref}</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <Endpoint
                  code={corridor.origin_code}
                  city={corridor.origin_city}
                  state={corridor.origin_state}
                  time={corridor.departure_time}
                  align="left"
                />
                <div className="flex min-w-[7rem] flex-1 flex-col items-center gap-1.5 pb-2">
                  <span className="micro text-mist-faint">{corridor.duration_label}</span>
                  <span className="relative flex w-full items-center" aria-hidden="true">
                    <span className="h-px flex-1 bg-line-bright" />
                    <span className="mx-2 grid h-7 w-7 place-items-center rounded-pill border border-line bg-night-850 text-marigold">
                      {corridor.mode === 'bus' ? <IconBus size={14} /> : <IconPlane size={14} />}
                    </span>
                    <span className="h-px flex-1 bg-line-bright" />
                  </span>
                  <span className="tnum micro text-mist-faint">{corridor.service_number}</span>
                </div>
                <Endpoint
                  code={corridor.dest_code}
                  city={corridor.dest_city}
                  state={corridor.dest_state}
                  time={corridor.arrival_time}
                  align="right"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-mist-dim">
                <span className="tnum inline-flex items-center gap-1.5">
                  <IconClock size={13} className="text-mist-faint" />
                  {formatDateYear(corridor.departure_date)} · departs {corridor.departure_time} IST
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconUsers size={13} className="text-mist-faint" />
                  {corridor.carrier_name}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconPin size={13} className="text-mist-faint" />
                  {corridor.pickup_hub}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="flex flex-col gap-1 lg:items-end">
                <Eyebrow>Landed per seat</Eyebrow>
                <div className="flex items-baseline gap-2.5">
                  <LandedFigure corridor={corridor} />
                  <span className="tnum text-[13px] text-mist-faint line-through">
                    {rupees(corridor.festival_surge_fare)}
                  </span>
                </div>
                <span className="text-[11.5px] text-mist-dim">
                  incl. {pct(corridor.platform_fee_pct, 1)} fee · surge{' '}
                  {surgeMultiple(corridor).toFixed(1)}× · save{' '}
                  <span className="tnum text-jade">{rupees(savingPerSeat(corridor))}</span> per seat
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={watched ? 'secondary' : 'quiet'}
                  size="sm"
                  onClick={() => onWatch(corridor)}
                  aria-pressed={watched}
                  icon={watched ? <IconBell size={13} /> : <IconBellOff size={13} />}
                >
                  {watched ? 'Watching' : 'Watch'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={closed || full}
                  onClick={() => onHold(corridor)}
                  icon={<IconTicket size={13} />}
                >
                  {full ? 'Block full' : closed ? 'Lock closed' : 'Hold seats'}
                </Button>
              </div>
            </div>
          </div>

          <SeatMap corridor={corridor} />
        </div>
      </header>

      {/* Body */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-12">
          <Section title="Price anatomy" eyebrow={`${pct(corridor.platform_fee_pct, 1)} platform fee, shown separately`}>
            <PriceAnatomy corridor={corridor} projectedSeats={projected} />
          </Section>

          <Section
            title="Tier slabs on this block"
            eyebrow={`Cohort at ${corridor.pledged_seats} of ${corridor.total_allotment} seats`}
          >
            <TierLadder corridor={corridor} projectedSeats={projected} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-mist-faint">
              Preview assumes your party of {previewSeats} joins. Slabs are contractual minimums from{' '}
              {corridor.contract_ref}: crossing one reprices every pledged seat on the corridor, not
              just the newest.
            </p>
          </Section>

          <Section title="Operations" eyebrow="What the manifest needs from you">
            <dl className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
              <Detail icon={<IconPin size={13} />} label="Pickup hub" value={corridor.pickup_hub} />
              <Detail
                icon={<IconLuggage size={13} />}
                label="Baggage"
                value={corridor.baggage_allowance}
              />
              <Detail
                icon={<ModeIcon size={13} />}
                label={corridor.mode === 'bus' ? 'Coach & berth' : 'Cabin'}
                value={corridor.cabin_or_berth || 'Not published'}
              />
              <Detail
                icon={<IconClock size={13} />}
                label="Manifest closes"
                value={
                  corridor.manifest_deadline
                    ? `${formatStamp(corridor.manifest_deadline)} IST`
                    : '72 hours before departure'
                }
              />
              <Detail
                icon={<IconShield size={13} />}
                label="Lock deadline"
                value={`${formatStamp(corridor.lock_deadline)} IST`}
              />
              <Detail
                icon={<IconUsers size={13} />}
                label="Carrier"
                value={`${corridor.carrier_name} · ${corridor.service_number}`}
              />
            </dl>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <Eyebrow>Boarding points</Eyebrow>
                {corridor.boarding_points.length === 0 ? (
                  <p className="text-[12.5px] text-mist-dim">
                    Not published yet — the desk adds feeder points once the block confirms.
                  </p>
                ) : (
                  <ol className="flex list-none flex-col gap-1.5">
                    {corridor.boarding_points.map((point, i) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 rounded-card border border-line bg-night-900 px-3 py-2"
                      >
                        <span className="tnum micro mt-0.5 shrink-0 text-mist-faint">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[12.5px] leading-snug text-mist">{point}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                <Eyebrow>Included</Eyebrow>
                {corridor.amenities.length === 0 ? (
                  <p className="text-[12.5px] text-mist-dim">Standard carrier inclusions apply.</p>
                ) : (
                  <ul className="flex list-none flex-col gap-1.5">
                    {corridor.amenities.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[12.5px] text-mist">
                        <IconCheck size={13} className="mt-0.5 shrink-0 text-jade" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-card border border-line bg-night-850 px-4 py-3.5">
              <Eyebrow>Refund & release rule</Eyebrow>
              <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{corridor.refund_rule}</p>
            </div>
          </Section>

          <Section
            title="Cohort on this corridor"
            eyebrow={`${pluralise(pledges.length, 'pledge')} written to the ledger`}
          >
            {pledges.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={20} />}
                title="No pledges published yet"
                body="This block is contracted and open, but no traveller has pledged into it since the ledger was last read. Yours would be the first row."
                action={
                  closed || full ? undefined : (
                    <Button size="sm" variant="primary" onClick={() => onHold(corridor)}>
                      Hold seats
                    </Button>
                  )
                }
              />
            ) : (
              <ul className="grid list-none gap-2 sm:grid-cols-2">
                {pledges.map((pledge) => (
                  <li
                    key={pledge.id}
                    className="flex items-center gap-3 rounded-card border border-line bg-night-900 px-3.5 py-2.5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill border border-line-bright bg-night-800 text-[11px] text-mist">
                      {initials(pledge.passenger_name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12.5px] text-ivory">
                        {pledge.passenger_name}
                      </span>
                      <span className="truncate text-[11px] text-mist-faint">
                        {pledge.passenger_cohort} · {relativeTime(pledge.created_at, now)}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right">
                      <span className="block text-[13px] text-ivory">{pledge.seats}</span>
                      <span className="micro block text-mist-faint">
                        seat{pledge.seats === 1 ? '' : 's'}
                      </span>
                    </span>
                    <Chip
                      tone={pledge.status === 'allotment_confirmed' ? 'jade' : 'marigold'}
                      className="hidden sm:inline-flex"
                    >
                      {pledge.status === 'allotment_confirmed' ? 'confirmed' : 'escrow'}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Carrier bid behind this block" eyebrow="Supply side, published">
            {bids.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-mist-dim">
                No bid row is published for {corridor.code}. The allotment is held directly against
                contract {corridor.contract_ref}; carrier desks can log a competing bid from the{' '}
                <Link to="/carriers" className="text-marigold underline-offset-2 hover:underline">
                  carrier desk
                </Link>
                .
              </p>
            ) : (
              <ul className="flex list-none flex-col gap-3">
                {bids.map((bid) => (
                  <li
                    key={bid.id}
                    className="rounded-card border border-line bg-night-900 px-4 py-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[13.5px] text-ivory">{bid.carrier_name}</span>
                        <span className="micro text-mist-faint">
                          {bid.desk_ref ? `Desk ${bid.desk_ref}` : 'Desk attribution pending'}
                        </span>
                      </div>
                      <Chip
                        tone={
                          bid.bid_status === 'accepted'
                            ? 'jade'
                            : bid.bid_status === 'countered'
                              ? 'clay'
                              : 'marigold'
                        }
                      >
                        {bid.bid_status.replace('_', ' ')}
                      </Chip>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <SmallCell label="Offered seats" value={String(bid.offered_seats)} />
                      <SmallCell label="Net group fare" value={rupees(bid.net_group_fare)} />
                      <SmallCell label="Hold window" value={`${bid.hold_window_hours} h`} />
                      <SmallCell
                        label="Logged"
                        value={relativeTime(bid.created_at, now)}
                      />
                    </dl>
                    <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
                      {bid.baggage_terms}
                      {bid.notes ? ` ${bid.notes}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Sticky rail */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Panel className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>Your party</Eyebrow>
              <Chip tone={projected >= corridor.tier1_min ? 'jade' : 'marigold'}>
                Tier {projected >= corridor.tier3_min ? 3 : projected >= corridor.tier2_min ? 2 : 1} after
                joining
              </Chip>
            </div>
            <Stepper
              value={previewSeats}
              min={1}
              max={Math.max(1, Math.min(8, seatsLeft(corridor)))}
              onChange={setPreviewSeats}
              label="Seats in your party"
              disabled={closed || full}
            />
            <Divider />
            <dl className="flex flex-col gap-1.5">
              <Row label="Carrier net" value={rupees(projectedNet)} />
              <Row label={`Platform fee ${pct(corridor.platform_fee_pct, 1)}`} value={rupees(projectedFee)} tone="clay" />
              <Row
                label={`Total for ${previewSeats} ${previewSeats === 1 ? 'seat' : 'seats'}`}
                value={rupees(projectedLanded * previewSeats)}
                strong
              />
              <Row
                label="Saving vs surge"
                value={rupees(Math.max(0, (corridor.festival_surge_fare - projectedLanded) * previewSeats))}
                tone="jade"
              />
            </dl>
            <Button
              variant="primary"
              size="lg"
              full
              disabled={closed || full}
              onClick={() => onHold(corridor)}
              icon={<IconTicket size={15} />}
            >
              {full ? 'Block full' : closed ? 'Lock closed' : 'Hold seats'}
            </Button>
            <p className="flex items-start gap-2 text-[11px] leading-snug text-mist-faint">
              <IconShield size={13} className="mt-px shrink-0 text-jade" />
              Nothing is charged today. If Tier I is not crossed by{' '}
              {formatDate(corridor.lock_deadline)}, every pledge on this corridor is released.
            </p>
          </Panel>

          <Panel className="flex flex-col gap-3 p-4">
            <Eyebrow>Deadlines</Eyebrow>
            <Deadline
              label="Lock deadline"
              iso={corridor.lock_deadline}
              now={now}
              note="cohort must clear Tier I"
            />
            <Deadline
              label="Manifest closes"
              iso={corridor.manifest_deadline}
              now={now}
              note="names frozen with the carrier"
            />
            <Deadline
              label="Departure"
              iso={`${corridor.departure_date}T${corridor.departure_time}:00+05:30`}
              now={now}
              note={corridor.duration_label}
            />
          </Panel>

          {similar.length > 0 ? (
            <Panel className="flex flex-col gap-3 p-4">
              <Eyebrow>Same city pair, other dates</Eyebrow>
              <ul className="flex list-none flex-col gap-2">
                {similar.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={corridorPath(c.code)}
                      className="flex items-center justify-between gap-3 rounded-card border border-line bg-night-850 px-3 py-2 transition-colors duration-200 hover:border-line-bright"
                    >
                      <span className="flex flex-col">
                        <span className="micro text-ivory">{c.code}</span>
                        <span className="text-[11px] text-mist-faint">
                          {formatDate(c.departure_date)} · {c.pledged_seats}/{c.total_allotment} pledged
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tnum text-[12.5px] text-mist">
                          {rupees(landedPerSeat(c))}
                        </span>
                        <IconArrow size={12} className="text-mist-faint" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

function Endpoint({
  code,
  city,
  state,
  time,
  align,
}: {
  code: string;
  city: string;
  state: string;
  time: string;
  align: 'left' | 'right';
}) {
  const telugu = teluguFor(city);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', align === 'right' && 'items-end text-right')}>
      <span className="tnum display text-[clamp(2.4rem,6vw,3.6rem)] leading-none text-ivory">
        {code}
      </span>
      <span className="tnum micro-md text-marigold">{time} IST</span>
      <span className="text-[12.5px] text-mist">{city}</span>
      {telugu ? (
        <span className="telugu text-[12px] text-mist-dim" lang="te">
          {telugu}
        </span>
      ) : null}
      <span className="text-[11px] text-mist-faint">{state}</span>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <Reveal>
      <section className="scroll-mt-24">
        <div className="flex flex-col gap-1.5 border-b border-line pb-3">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className="display text-[clamp(1.5rem,3vw,2rem)] text-ivory">{title}</h2>
        </div>
        <div className="pt-5">{children}</div>
      </section>
    </Reveal>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  // One grouping div, exactly as the definition-list rule allows: dl > div >
  // dt + dd. The icon lives inside the dt it decorates, because a <dl> may hold
  // nothing that is not a term, a description, or a div wrapping those.
  return (
    <div className="bg-night-900 px-4 py-3.5">
      <dt className="micro flex items-center gap-1.5 text-mist-faint">
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-1 text-[12.5px] leading-snug text-mist">{value}</dd>
    </div>
  );
}

function SmallCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="micro text-mist-faint">{label}</dt>
      <dd className="tnum text-[12.5px] text-ivory">{value}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: 'jade' | 'clay';
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-[12px]', strong ? 'text-ivory' : 'text-mist-dim')}>{label}</dt>
      <dd
        className={cn(
          'tnum shrink-0',
          strong ? 'text-[16px] font-medium' : 'text-[12.5px]',
          tone === 'jade' ? 'text-jade' : tone === 'clay' ? 'text-clay' : 'text-ivory',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Deadline({
  label,
  iso,
  now,
  note,
}: {
  label: string;
  iso: string | null;
  now: number;
  note: string;
}) {
  if (!iso) return null;
  const passed = msUntil(iso, now) <= 0;
  const days = daysUntil(iso, now);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] text-mist">{label}</span>
        <span className="text-[11px] text-mist-faint">{note}</span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Countdown
          iso={iso}
          closedLabel="passed"
          className={cn('text-[13px]', passed ? 'text-mist-faint' : 'text-marigold')}
        />
        <span className="tnum micro text-mist-faint">
          {passed ? formatDate(iso) : `${days}d · ${formatDate(iso)}`}
        </span>
      </div>
    </div>
  );
}

/** One dot per contracted seat. Filled dots are pledged. */
function SeatMap({ corridor }: { corridor: Corridor }) {
  const total = Math.min(corridor.total_allotment, 72);
  const filled = Math.min(corridor.pledged_seats, total);
  const tier = activeTier(corridor);
  const marks = [
    { at: corridor.tier1_min, label: 'Tier I' },
    { at: corridor.tier2_min, label: 'Tier II' },
    { at: corridor.tier3_min, label: 'Tier III' },
  ];

  return (
    <div className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>Allotment map</Eyebrow>
        <span className="tnum text-[11.5px] text-mist-dim">
          {filled} pledged · {seatsLeft(corridor)} open · {corridor.total_allotment} contracted
        </span>
      </div>
      <div
        className="flex flex-wrap gap-[3px]"
        role="img"
        aria-label={`${filled} of ${corridor.total_allotment} contracted seats are pledged; tier ${tier || 0} is live`}
      >
        {Array.from({ length: total }, (_, i) => {
          const isFilled = i < filled;
          const markIndex = marks.findIndex((m) => m.at === i + 1);
          return (
            <span
              key={i}
              title={markIndex >= 0 ? `${marks[markIndex]?.label} at seat ${i + 1}` : undefined}
              className={cn(
                'h-[7px] w-[7px] rounded-[1.5px] transition-colors duration-500',
                isFilled ? 'bg-marigold' : 'bg-night-750',
                markIndex >= 0 && 'ring-1 ring-inset ring-line-bright',
              )}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {marks.map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                corridor.pledged_seats >= m.at ? 'bg-jade' : 'bg-night-700',
              )}
              aria-hidden="true"
            />
            <span className="tnum micro text-mist-faint">
              {m.label} at {m.at}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function UnknownCorridor({ code, corridors }: { code: string; corridors: Corridor[] }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
      <EmptyState
        as="h1"
        icon={<IconArrow size={22} />}
        title={`No corridor coded ${code}`}
        body="The code may have been retired when its block closed, or the link was mistyped. The corridors below are open for pledges right now."
        action={
          <div className="mt-2 flex flex-col items-center gap-3">
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-2 rounded-pill bg-marigold px-4 text-[12.5px] font-medium text-night-900 transition-colors duration-200 hover:bg-marigold-bright"
            >
              Back to the board
            </Link>
            {corridors.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                {corridors.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    to={corridorPath(c.code)}
                    className="micro rounded-pill border border-line px-2.5 py-1 text-mist-dim transition-colors duration-200 hover:border-marigold/50 hover:text-marigold"
                  >
                    {c.code}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}

function CorridorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <Skeleton className="h-3 w-40" />
      <div className="mt-5 rounded-card border border-line bg-night-900 p-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-28 rounded-pill" />
          <Skeleton className="h-5 w-20 rounded-pill" />
        </div>
        <div className="mt-6 flex items-end justify-between gap-6">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-12 w-24" />
        </div>
        <Skeleton className="mt-6 h-2 w-full rounded-pill" />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
