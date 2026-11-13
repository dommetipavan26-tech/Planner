import { useMemo, useState } from 'react';
import { Link, corridorPath } from '../lib/router';
import { useCoarseNow } from '../hooks/useClock';
import { useMounted } from '../hooks/useMounted';
import type { Ledger } from '../hooks/useLedger';
import {
  compactRupees,
  formatDate,
  formatStamp,
  initials,
  isClosed,
  maskPhone,
  pct,
  relativeTime,
  rupees,
} from '../lib/format';
import type { Corridor } from '../lib/types';
import {
  Button,
  Chip,
  Countdown,
  Divider,
  EmptyState,
  Eyebrow,
  Meter,
  Panel,
  Reveal,
  Segmented,
  cn,
} from '../components/ui';
import { statusLabel, statusTone } from '../components/CorridorCard';
import {
  IconArrow,
  IconBell,
  IconBellOff,
  IconBus,
  IconClock,
  IconPin,
  IconPlane,
  IconTicket,
  IconUsers,
} from '../components/icons';

type Tab = 'pledges' | 'watching';

export function TripsView({
  ledger,
  onWatch,
  onToast,
}: {
  ledger: Ledger;
  onWatch: (corridor: Corridor) => void;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const now = useCoarseNow();
  const mounted = useMounted();
  const [tab, setTab] = useState<Tab>('pledges');

  const corridorFor = useMemo(() => {
    const map = new Map(ledger.corridors.map((c) => [c.id, c]));
    return (id: string) => map.get(id);
  }, [ledger.corridors]);

  const watched = useMemo(
    () =>
      ledger.watches
        .map((w) => corridorFor(w.corridor_id))
        .filter((c): c is Corridor => Boolean(c))
        .sort((a, b) => a.departure_date.localeCompare(b.departure_date)),
    [ledger.watches, corridorFor],
  );

  const mine = ledger.mine;

  const summary = useMemo(() => {
    const seats = mine.reduce((sum, p) => sum + p.seats, 0);
    const payable = mine.reduce((sum, p) => sum + p.total_payable, 0);
    const saving = mine.reduce((sum, p) => sum + p.estimated_saving, 0);
    const confirmed = mine.filter((p) => p.status === 'allotment_confirmed').length;
    return { seats, payable, saving, confirmed, escrow: mine.length - confirmed };
  }, [mine]);

  const copyRef = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      onToast(`${ref} copied`, 'success');
    } catch {
      onToast(`Reference is ${ref}`, 'info');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:py-14">
      <header className="flex flex-col gap-5 border-b border-rule pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <Eyebrow>Device-scoped · no account needed</Eyebrow>
          <h1 className="display text-[clamp(2rem,4.6vw,3.25rem)] text-ink">My trips</h1>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-muted">
            Every pledge and watch you make from this browser, read back from Postgres through a
            SECURITY DEFINER function that only ever returns rows belonging to your device id.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <Segmented
            label="Trips view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pledges', label: `Pledges (${mine.length})` },
              { value: 'watching', label: `Watching (${watched.length})` },
            ]}
          />
          <p className="tnum micro text-ink-faint">
            {/* The device id lives in localStorage, so it does not exist during a
                server render. Naming the source instead of the value keeps the
                prerendered markup and the browser's first render identical — and
                reads as a sentence in a static document, where a dash would read
                as something missing. */}
            device{' '}
            {mounted ? `${ledger.device.slice(0, 8)}…${ledger.device.slice(-4)}` : 'this browser'}
          </p>
        </div>
      </header>

      {tab === 'pledges' ? (
        <div className="mt-8 flex flex-col gap-6">
          {mine.length > 0 ? (
            <>
              <dl className="grid gap-px overflow-hidden rounded-card border border-rule bg-rule-strong sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCell label="Seats held" value={String(summary.seats)} note={`across ${mine.length} pledge${mine.length === 1 ? '' : 's'}`} />
                <SummaryCell
                  label="Payable at lock"
                  value={compactRupees(summary.payable)}
                  note="captured only if the block confirms"
                  tone="marigold"
                />
                <SummaryCell
                  label="Saving vs surge"
                  value={compactRupees(summary.saving)}
                  note="at the slab your corridor reached"
                  tone="jade"
                />
                <SummaryCell
                  label="Status"
                  value={`${summary.confirmed} confirmed`}
                  note={`${summary.escrow} still in escrow hold`}
                />
              </dl>

              <ul className="flex list-none flex-col gap-4">
                {mine.map((pledge, i) => {
                  const corridor = corridorFor(pledge.corridor_id);
                  return (
                    <Reveal key={pledge.id} as="li" delay={Math.min(i, 4) * 50}>
                      <article className="overflow-hidden rounded-card border border-rule bg-surface shadow-panel transition-colors duration-300 hover:border-rule-strong">
                        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill border border-accent/40 bg-accent-tint text-[13px] font-medium text-accent-deep">
                              {initials(pledge.passenger_name)}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[13.5px] text-ink">{pledge.passenger_name}</span>
                              <span className="tnum text-[11.5px] text-ink-muted">
                                {maskPhone(pledge.passenger_phone)} · {pledge.passenger_cohort}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Chip tone={pledge.status === 'allotment_confirmed' ? 'jade' : pledge.status === 'released' ? 'neutral' : 'marigold'} dot={pledge.status === 'escrow_held'}>
                              {pledge.status === 'allotment_confirmed'
                                ? 'Allotment confirmed'
                                : pledge.status === 'released'
                                  ? 'Released'
                                  : 'Escrow held'}
                            </Chip>
                            <button
                              type="button"
                              onClick={() => void copyRef(pledge.booking_ref)}
                              className="tnum micro rounded-pill border border-rule px-2 py-1 text-ink-muted transition-colors duration-200 hover:border-rule-strong hover:text-ink"
                              title="Copy booking reference"
                            >
                              {pledge.booking_ref}
                            </button>
                          </div>
                        </div>

                        <div className="perforation h-px w-full" aria-hidden="true" />

                        <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1.3fr_1fr]">
                          {corridor ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col">
                                  <span className="tnum display text-[24px] leading-none text-ink">
                                    {corridor.origin_code}
                                  </span>
                                  <span className="micro mt-1 text-ink-faint">
                                    {corridor.departure_time}
                                  </span>
                                </div>
                                <div className="flex flex-1 flex-col items-center gap-1">
                                  <span className="micro text-ink-faint">
                                    {corridor.duration_label}
                                  </span>
                                  <span className="relative flex w-full items-center" aria-hidden="true">
                                    <span className="h-px flex-1 bg-rule-strongest" />
                                    <span className="mx-1.5 text-accent-deep">
                                      {corridor.mode === 'bus' ? (
                                        <IconBus size={13} />
                                      ) : (
                                        <IconPlane size={13} />
                                      )}
                                    </span>
                                    <span className="h-px flex-1 bg-rule-strongest" />
                                  </span>
                                  <span className="micro text-ink-faint">
                                    {corridor.service_number}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="tnum display text-[24px] leading-none text-ink">
                                    {corridor.dest_code}
                                  </span>
                                  <span className="micro mt-1 text-ink-faint">
                                    {corridor.arrival_time}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-muted">
                                <span className="tnum inline-flex items-center gap-1.5">
                                  <IconClock size={12} className="text-ink-faint" />
                                  {formatDate(corridor.departure_date)} · {corridor.carrier_name}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <IconPin size={12} className="text-ink-faint" />
                                  <span className="truncate">{pledge.boarding_point}</span>
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-baseline justify-between gap-3">
                                  <span className="micro text-ink-faint">Cohort</span>
                                  <span className="tnum text-[11.5px] text-ink-muted">
                                    {corridor.pledged_seats}/{corridor.total_allotment} ·{' '}
                                    {statusLabel(corridor, now)}
                                  </span>
                                </div>
                                <Meter
                                  filled={corridor.pledged_seats}
                                  total={corridor.total_allotment}
                                  tone={isClosed(corridor, now) ? 'lagoon' : 'marigold'}
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-[12.5px] text-ink-muted">
                              This corridor is no longer on the board. Your pledge reference{' '}
                              <span className="tnum text-ink-soft">{pledge.booking_ref}</span> is still
                              valid with the carrier desk.
                            </p>
                          )}

                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 self-start rounded-card border border-rule bg-raised px-4 py-3.5">
                            <Cell label="Seats" value={String(pledge.seats)} />
                            <Cell label="Net fare" value={rupees(pledge.locked_unit_fare)} />
                            <Cell label="Fee" value={rupees(pledge.platform_fee_unit)} tone="clay" />
                            <Cell label="Landed" value={rupees(pledge.locked_unit_fare + pledge.platform_fee_unit)} />
                            <Divider className="col-span-2 my-0.5" />
                            <Cell label="Payable at lock" value={rupees(pledge.total_payable)} tone="marigold" strong />
                            <Cell label="Saving" value={rupees(pledge.estimated_saving)} tone="jade" strong />
                            <Cell
                              label="Ceiling you set"
                              value={rupees(pledge.max_willing_fare)}
                              note="surge fare at pledge time"
                            />
                            <Cell
                              label="Pledged"
                              value={relativeTime(pledge.created_at, now)}
                              note={formatStamp(pledge.created_at)}
                            />
                          </dl>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft px-5 py-3">
                          <p className="text-[11.5px] text-ink-faint">
                            {corridor && !isClosed(corridor, now) ? (
                              <>
                                Lock in{' '}
                                <Countdown iso={corridor.lock_deadline} className="text-ink-muted" /> ·
                                names free to change until{' '}
                                {corridor.manifest_deadline
                                  ? formatDate(corridor.manifest_deadline)
                                  : 'T-72h'}
                              </>
                            ) : (
                              <>This block has passed its lock deadline.</>
                            )}
                          </p>
                          <div className="flex gap-2">
                            {corridor ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="quiet"
                                  onClick={() => onWatch(corridor)}
                                  icon={
                                    ledger.isWatched(corridor.id) ? (
                                      <IconBell size={13} />
                                    ) : (
                                      <IconBellOff size={13} />
                                    )
                                  }
                                >
                                  {ledger.isWatched(corridor.id) ? 'Watching' : 'Watch'}
                                </Button>
                                <Link
                                  to={corridorPath(corridor.code)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-rule px-3 text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-rule-strong hover:text-ink"
                                >
                                  Corridor <IconArrow size={12} />
                                </Link>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </ul>

              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                Pledges are not tickets. Nothing is captured until the corridor clears Tier I and the
                carrier confirms the allotment in writing; until then the row sits in escrow and can be
                released without a refund cycle, because no money moved.
              </p>
            </>
          ) : (
            <EmptyState
              icon={<IconTicket size={22} />}
              as="h2"
              title="No pledges from this device yet"
              body="Hold seats on an open corridor and the pledge appears here the moment it is written to Postgres — along with the slab price it locked and the saving against the surge fare."
              action={
                <Link
                  to="/"
                  className="inline-flex h-9 items-center gap-2 rounded-pill bg-accent px-4 text-[12.5px] font-medium text-on-accent transition-colors duration-200 hover:bg-accent-bright"
                >
                  Browse live corridors <IconArrow size={13} />
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {watched.length === 0 ? (
            <EmptyState
              icon={<IconBell size={22} />}
              as="h2"
              title="You are not watching any corridor"
              body="Watching stores a row against your device id. When a watched corridor crosses a tier threshold, the ledger event appears in the ticker at the top of the desk."
              action={
                <Link
                  to="/"
                  className="inline-flex h-9 items-center gap-2 rounded-pill border border-rule-strong px-4 text-[12.5px] text-ink-soft transition-colors duration-200 hover:text-ink"
                >
                  Find a corridor <IconArrow size={13} />
                </Link>
              }
            />
          ) : (
            <>
              <ul className="grid list-none gap-4 md:grid-cols-2 xl:grid-cols-3">
                {watched.map((corridor, i) => (
                  <Reveal key={corridor.id} as="li" delay={Math.min(i, 5) * 40}>
                    <Panel hover className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="micro text-ink">{corridor.code}</span>
                          <span className="text-[12px] text-ink-muted">
                            {corridor.origin_city} → {corridor.dest_city}
                          </span>
                        </div>
                        <Chip tone={statusTone(corridor, now)}>{statusLabel(corridor, now)}</Chip>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="tnum text-[15px] text-ink">
                          {rupees(corridor.tier1_fare)}
                          <span className="text-[11px] text-ink-faint"> net from</span>
                        </span>
                        <span className="tnum text-[11.5px] text-ink-muted">
                          {corridor.pledged_seats}/{corridor.total_allotment}
                        </span>
                      </div>
                      <Meter filled={corridor.pledged_seats} total={corridor.total_allotment} />
                      <p className="text-[11px] text-ink-faint">
                        {isClosed(corridor, now) ? (
                          <>Closed {formatDate(corridor.lock_deadline)}</>
                        ) : (
                          <>
                            Locks in <Countdown iso={corridor.lock_deadline} /> · departs{' '}
                            {formatDate(corridor.departure_date)}
                          </>
                        )}
                      </p>
                      <div className="mt-auto flex gap-2 pt-1">
                        <Link
                          to={corridorPath(corridor.code)}
                          className={cn(
                            'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-pill border border-rule text-[12px] text-ink-soft',
                            'transition-colors duration-200 hover:border-rule-strong hover:text-ink',
                          )}
                        >
                          Open <IconArrow size={12} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => onWatch(corridor)}
                          className="grid h-8 w-8 place-items-center rounded-pill border border-accent/40 bg-accent-tint text-accent-deep transition-colors duration-200 hover:bg-accent-tint-strong"
                          aria-label={`Stop watching ${corridor.code}`}
                          title="Stop watching"
                        >
                          <IconBellOff size={13} />
                        </button>
                      </div>
                    </Panel>
                  </Reveal>
                ))}
              </ul>
              <p className="flex items-center gap-2 text-[11.5px] text-ink-faint">
                <IconUsers size={13} />
                {watched.length} corridor{watched.length === 1 ? '' : 's'} watched ·{' '}
                {pct(
                  (watched.filter((c) => c.pledged_seats >= c.tier1_min).length /
                    Math.max(1, watched.length)) *
                    100,
                )}{' '}
                already past Tier I
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCell({
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
    <div className="flex flex-col gap-1 bg-surface px-4 py-4">
      <dt className="micro text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'tnum text-[24px] leading-none font-medium',
          tone === 'jade' ? 'text-jade-deep' : tone === 'marigold' ? 'text-accent-deep' : 'text-ink',
        )}
      >
        {value}
      </dd>
      <dd className="text-[11px] text-ink-faint">{note}</dd>
    </div>
  );
}

function Cell({
  label,
  value,
  note,
  tone,
  strong,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'jade' | 'clay' | 'marigold';
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="micro text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'tnum leading-none',
          strong ? 'text-[15px] font-medium' : 'text-[12.5px]',
          tone === 'jade' ? 'text-jade-deep' : tone === 'clay' ? 'text-clay-deep' : tone === 'marigold' ? 'text-accent-deep' : 'text-ink',
        )}
      >
        {value}
      </dd>
      {note ? <dd className="text-[10.5px] text-ink-faint">{note}</dd> : null}
    </div>
  );
}
