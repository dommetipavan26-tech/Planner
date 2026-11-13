import { memo } from 'react';
import { Link, corridorPath } from '../lib/router';
import { useCoarseNow } from '../hooks/useClock';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import {
  activeTier,
  feeOn,
  formatDate,
  formatWeekday,
  isClosed,
  isFull,
  landedPerSeat,
  pct,
  rupees,
  savingPct,
  savingPerSeat,
  surgeMultiple,
} from '../lib/format';
import type { Corridor } from '../lib/types';
import { teluguFor } from '../lib/telugu';
import { Button, Chip, Countdown, Meter, cn, type Tone } from './ui';
import { TierLadder } from './Pricing';
import {
  IconArrow,
  IconBell,
  IconBellOff,
  IconBus,
  IconClock,
  IconPlane,
  IconTicket,
  IconUsers,
} from './icons';

export function statusTone(c: Corridor, now: number): Tone {
  if (isClosed(c, now)) return 'neutral';
  if (isFull(c)) return 'clay';
  const tier = activeTier(c);
  if (tier === 3) return 'jade';
  if (tier === 2) return 'marigold';
  if (tier === 1) return 'lagoon';
  return 'clay';
}

/**
 * The state of a corridor, in the words a traveller would use.
 *
 * It used to read 'Tier II locked' and 'Collecting pledges'. Neither says
 * anything to someone who has not yet read the explainer, and the chip is the
 * first thing they see: what changed is the price, so the chip says the price
 * changed. 'Tier' stays in the ladder and in the explainer, where it is defined.
 */
export function statusLabel(c: Corridor, now: number): string {
  if (isClosed(c, now)) return 'Closed to pledges';
  if (isFull(c)) return 'Block full';
  const tier = activeTier(c);
  if (tier === 3) return 'Lowest fare reached';
  if (tier === 2) return 'Second fare cut';
  if (tier === 1) return 'First fare cut';
  return 'Pledges open';
}

function ModeIcon({ mode, size = 15 }: { mode: Corridor['mode']; size?: number }) {
  return mode === 'bus' ? <IconBus size={size} /> : <IconPlane size={size} />;
}

interface CardProps {
  corridor: Corridor;
  watched?: boolean;
  onWatch?: (corridor: Corridor) => void;
  onHold?: (corridor: Corridor) => void;
  holding?: boolean;
  index?: number;
}

/**
 * The corridor stub. Reads top-down the way a traveller actually decides:
 * where and when, then what it costs, then how close the cohort is, then the
 * single action. Every number on it is derived in lib/format — the card does no
 * arithmetic of its own.
 */
function CorridorCardBase({ corridor, watched, onWatch, onHold, holding }: CardProps) {
  const now = useCoarseNow();
  const closed = isClosed(corridor, now);
  const full = isFull(corridor);
  const landed = useAnimatedNumber(landedPerSeat(corridor));
  const pledged = useAnimatedNumber(corridor.pledged_seats);
  const tone = statusTone(corridor, now);
  const needsTierI = corridor.pledged_seats < corridor.tier1_min;
  const atFloor = corridor.pledged_seats >= corridor.tier3_min;
  const toNext = needsTierI
    ? corridor.tier1_min - corridor.pledged_seats
    : Math.max(0, corridor.tier3_min - corridor.pledged_seats);
  // What a seat actually costs at a threshold: the carrier's net fare plus the
  // platform fee, which is the figure quoted everywhere else on the card.
  const landedAt = (net: number) => net + feeOn(net, corridor.platform_fee_pct);
  const tierILanded = landedAt(corridor.tier1_fare);
  const tier3Landed = landedAt(corridor.tier3_fare);

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-card border bg-surface shadow-panel',
        'transition-[border-color,transform,box-shadow] duration-300 ease-out-expo',
        closed ? 'border-rule opacity-[0.72]' : 'border-rule hover:border-rule-strong hover:shadow-lift',
      )}
    >
      {/* Header strip */}
      <header className="flex items-start justify-between gap-3 border-b border-rule-soft px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-pill bg-sunken text-ink-soft">
              <ModeIcon mode={corridor.mode} size={12} />
            </span>
            <span className="micro truncate text-ink">{corridor.code}</span>
            <span className="micro shrink-0 text-ink-faint">{corridor.service_number}</span>
          </div>
          <p className="truncate text-[11.5px] text-ink-muted">{corridor.festival}</p>
        </div>
        <Chip tone={tone} dot={!closed && !full}>
          {statusLabel(corridor, now)}
        </Chip>
      </header>

      {/* Route */}
      <div className="flex items-stretch gap-3 px-4 pt-4">
        <Endpoint
          code={corridor.origin_code}
          city={corridor.origin_city}
          time={corridor.departure_time}
          align="left"
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1 pt-1">
          <span className="micro text-ink-faint">{corridor.duration_label.split('·')[0]?.trim()}</span>
          <span className="relative flex w-full items-center" aria-hidden="true">
            <span className="h-px flex-1 bg-rule-strongest" />
            <span className="mx-1 text-ink-muted">
              <IconArrow size={13} />
            </span>
            <span className="h-px flex-1 bg-rule-strongest" />
          </span>
          <span className="micro text-ink-faint">
            {corridor.mode === 'bus' ? 'by road' : 'non-stop'}
          </span>
        </div>
        <Endpoint
          code={corridor.dest_code}
          city={corridor.dest_city}
          time={corridor.arrival_time}
          align="right"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2.5 text-[11.5px] text-ink-muted">
        <span className="tnum inline-flex items-center gap-1.5">
          <IconClock size={12} className="text-ink-faint" />
          {formatWeekday(corridor.departure_date)}, {formatDate(corridor.departure_date)}
        </span>
        <span className="h-3 w-px bg-rule-strong" aria-hidden="true" />
        <span className="truncate">{corridor.carrier_name}</span>
      </div>

      {/* Price */}
      <div className="mt-4 flex items-end justify-between gap-4 border-t border-rule-soft px-4 py-3.5">
        <div className="flex flex-col gap-1">
          <span className="micro text-ink-faint">Landed per seat</span>
          <span className="flex items-baseline gap-2">
            <span className="tnum display text-[30px] leading-none text-ink">
              {rupees(Math.round(landed))}
            </span>
            <span className="tnum text-[12px] text-ink-faint line-through">
              {rupees(corridor.festival_surge_fare)}
            </span>
          </span>
          <span className="text-[11px] leading-snug text-ink-muted">
            incl. {pct(corridor.platform_fee_pct, 1)}% platform fee · surge is{' '}
            {surgeMultiple(corridor).toFixed(1)}×
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 pb-0.5">
          <Chip tone="jade">save {pct(savingPct(corridor))}</Chip>
          <span className="tnum text-[11.5px] text-ink-muted">
            {rupees(savingPerSeat(corridor))}/seat
          </span>
        </div>
      </div>

      {/* Cohort progress */}
      <div className="px-4 pb-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="tnum inline-flex items-center gap-1.5 text-[12.5px] text-ink">
            <IconUsers size={13} className="text-ink-muted" />
            {Math.round(pledged)}
            <span className="text-ink-faint">/ {corridor.total_allotment} pledged</span>
          </span>
          <span className="micro text-ink-muted">
            {closed ? (
              'lock closed'
            ) : (
              <>
                <Countdown iso={corridor.lock_deadline} className="text-ink-soft" /> to lock
              </>
            )}
          </span>
        </div>
        <Meter
          filled={corridor.pledged_seats}
          total={corridor.total_allotment}
          tone={closed ? 'lagoon' : activeTier(corridor) >= 2 ? 'marigold' : 'lagoon'}
        />
        <TierLadder corridor={corridor} compact />
        <p className="mt-2 text-[11.5px] leading-snug text-ink-muted">
          {full ? (
            <>Allotment is full. Join the waitlist from the corridor page.</>
          ) : closed ? (
            <>This block closed at its lock deadline. Nothing further can be pledged.</>
          ) : atFloor ? (
            <>
              That is the floor. {rupees(corridor.tier3_fare)} net is the fare the carrier
              contracted, so anyone who pledges from here pays the same as the first ones in.
            </>
          ) : needsTierI ? (
            <>
              <span className="tnum text-accent-deep">{toNext} more seats</span> and every pledged
              seat drops to {rupees(tierILanded)}. Pledging costs nothing until then, and no card is
              charged.
            </>
          ) : (
            <>
              <span className="tnum text-accent-deep">{toNext} more seats</span> and the fare drops
              again to {rupees(tier3Landed)} — repriced for everyone already in the cohort.
            </>
          )}
        </p>
      </div>

      {/* Actions */}
      <footer className="mt-auto flex items-center gap-2 border-t border-rule-soft px-4 py-3">
        <Link
          to={corridorPath(corridor.code)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill border border-rule text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-rule-strong hover:text-ink"
        >
          Details
          <IconArrow size={12} />
        </Link>
        {onWatch ? (
          <button
            type="button"
            onClick={() => onWatch(corridor)}
            aria-pressed={watched}
            aria-label={watched ? `Stop watching ${corridor.code}` : `Watch ${corridor.code}`}
            title={watched ? 'Watching — you get tier updates' : 'Watch this corridor'}
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-pill border transition-colors duration-200',
              watched
                ? 'border-accent/50 bg-accent-tint text-accent-deep'
                : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
            )}
          >
            {watched ? <IconBell size={14} /> : <IconBellOff size={14} />}
          </button>
        ) : null}
        {onHold ? (
          <Button
            size="sm"
            variant="primary"
            className="h-9"
            disabled={closed || full}
            loading={holding}
            icon={<IconTicket size={13} />}
            onClick={() => onHold(corridor)}
          >
            {full ? 'Full' : closed ? 'Closed' : 'Hold seats'}
          </Button>
        ) : null}
      </footer>

      {/* Perforation: a printed-stock cue at the card foot */}
      <span className="perforation absolute inset-x-0 bottom-0 h-px opacity-60" aria-hidden="true" />
    </article>
  );
}

function Endpoint({
  code,
  city,
  time,
  align,
}: {
  code: string;
  city: string;
  time: string;
  align: 'left' | 'right';
}) {
  const telugu = teluguFor(city);
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', align === 'right' && 'items-end text-right')}>
      <span className="tnum display text-[26px] leading-none text-ink">{code}</span>
      <span className="tnum micro-md text-ink-soft">{time}</span>
      <span className="max-w-[8.5rem] truncate text-[11.5px] text-ink-muted" title={city}>
        {city}
      </span>
      {telugu ? (
        <span className="telugu max-w-[8.5rem] truncate text-[11px] text-ink-faint" lang="te">
          {telugu}
        </span>
      ) : null}
    </div>
  );
}

export const CorridorCard = memo(CorridorCardBase);

/** Dense row used by the compare table. */
export function CorridorRow({
  corridor,
  onOpen,
}: {
  corridor: Corridor;
  onOpen?: (corridor: Corridor) => void;
}) {
  const now = useCoarseNow();
  const closed = isClosed(corridor, now);
  return (
    <tr
      className={cn(
        'group transition-colors duration-200 hover:bg-raised',
        closed && 'opacity-60',
      )}
    >
      <td className="px-3 py-2.5">
        <Link
          to={corridorPath(corridor.code)}
          className="micro text-ink group-hover:text-accent-deep"
        >
          {corridor.code}
        </Link>
        <span className="mt-0.5 block text-[11px] text-ink-faint">{corridor.festival}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
          <ModeIcon mode={corridor.mode} size={13} />
          {corridor.origin_code}→{corridor.dest_code}
        </span>
        <span className="tnum mt-0.5 block text-[11px] text-ink-faint">
          {formatDate(corridor.departure_date)} · {corridor.departure_time}
        </span>
      </td>
      <td className="tnum px-3 py-2.5 text-right text-[12.5px] text-ink-faint line-through">
        {rupees(corridor.festival_surge_fare)}
      </td>
      <td className="tnum px-3 py-2.5 text-right text-[13px] font-medium text-ink">
        {rupees(landedPerSeat(corridor))}
      </td>
      <td className="tnum px-3 py-2.5 text-right text-[12.5px] text-jade-deep">
        −{pct(savingPct(corridor))}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Meter
            filled={corridor.pledged_seats}
            total={corridor.total_allotment}
            tone={closed ? 'lagoon' : 'marigold'}
            className="w-20"
          />
          <span className="tnum micro text-ink-muted">
            {corridor.pledged_seats}/{corridor.total_allotment}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-[11.5px] text-ink-faint">
        <Countdown iso={corridor.lock_deadline} closedLabel="closed" />
      </td>
      <td className="px-3 py-2.5 text-right">
        {onOpen ? (
          <Button size="sm" variant="quiet" onClick={() => onOpen(corridor)} disabled={closed}>
            Hold
          </Button>
        ) : (
          <Link
            to={corridorPath(corridor.code)}
            className="micro inline-flex items-center gap-1 text-ink-muted hover:text-accent-deep"
          >
            Open <IconArrow size={11} />
          </Link>
        )}
      </td>
    </tr>
  );
}
