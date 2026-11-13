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

export function statusLabel(c: Corridor, now: number): string {
  if (isClosed(c, now)) return 'Lock closed';
  if (isFull(c)) return 'Block full';
  const tier = activeTier(c);
  if (tier === 3) return 'Tier III locked';
  if (tier === 2) return 'Tier II locked';
  if (tier === 1) return 'Tier I locked';
  return 'Collecting pledges';
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
  const tierILanded =
    corridor.tier1_fare + feeOn(corridor.tier1_fare, corridor.platform_fee_pct);

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-card border bg-night-900 shadow-panel',
        'transition-[border-color,transform,box-shadow] duration-300 ease-out-expo',
        closed ? 'border-line opacity-[0.72]' : 'border-line hover:border-line-bright hover:shadow-lift',
      )}
    >
      {/* Header strip */}
      <header className="flex items-start justify-between gap-3 border-b border-line-soft px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-pill bg-night-800 text-mist">
              <ModeIcon mode={corridor.mode} size={12} />
            </span>
            <span className="micro truncate text-ivory">{corridor.code}</span>
            <span className="micro shrink-0 text-mist-faint">{corridor.service_number}</span>
          </div>
          <p className="truncate text-[11.5px] text-mist-dim">{corridor.festival}</p>
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
          <span className="micro text-mist-faint">{corridor.duration_label.split('·')[0]?.trim()}</span>
          <span className="relative flex w-full items-center" aria-hidden="true">
            <span className="h-px flex-1 bg-line-bright" />
            <span className="mx-1 text-mist-dim">
              <IconArrow size={13} />
            </span>
            <span className="h-px flex-1 bg-line-bright" />
          </span>
          <span className="micro text-mist-faint">
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2.5 text-[11.5px] text-mist-dim">
        <span className="tnum inline-flex items-center gap-1.5">
          <IconClock size={12} className="text-mist-faint" />
          {formatWeekday(corridor.departure_date)}, {formatDate(corridor.departure_date)}
        </span>
        <span className="h-3 w-px bg-line" aria-hidden="true" />
        <span className="truncate">{corridor.carrier_name}</span>
      </div>

      {/* Price */}
      <div className="mt-4 flex items-end justify-between gap-4 border-t border-line-soft px-4 py-3.5">
        <div className="flex flex-col gap-1">
          <span className="micro text-mist-faint">Landed per seat</span>
          <span className="flex items-baseline gap-2">
            <span className="tnum display text-[30px] leading-none text-ivory">
              {rupees(Math.round(landed))}
            </span>
            <span className="tnum text-[12px] text-mist-faint line-through">
              {rupees(corridor.festival_surge_fare)}
            </span>
          </span>
          <span className="text-[11px] leading-snug text-mist-dim">
            incl. {pct(corridor.platform_fee_pct, 1)}% platform fee · surge is{' '}
            {surgeMultiple(corridor).toFixed(1)}×
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 pb-0.5">
          <Chip tone="jade">save {pct(savingPct(corridor))}</Chip>
          <span className="tnum text-[11.5px] text-mist-dim">
            {rupees(savingPerSeat(corridor))}/seat
          </span>
        </div>
      </div>

      {/* Cohort progress */}
      <div className="px-4 pb-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="tnum inline-flex items-center gap-1.5 text-[12.5px] text-ivory">
            <IconUsers size={13} className="text-mist-dim" />
            {Math.round(pledged)}
            <span className="text-mist-faint">/ {corridor.total_allotment} pledged</span>
          </span>
          <span className="micro text-mist-dim">
            {closed ? (
              'lock closed'
            ) : (
              <>
                <Countdown iso={corridor.lock_deadline} className="text-mist" /> to lock
              </>
            )}
          </span>
        </div>
        <Meter
          filled={corridor.pledged_seats}
          total={corridor.total_allotment}
          marks={[
            { at: corridor.tier1_min, label: 'Tier I' },
            { at: corridor.tier2_min, label: 'Tier II' },
            { at: corridor.tier3_min, label: 'Tier III' },
          ]}
          tone={closed ? 'lagoon' : activeTier(corridor) >= 2 ? 'marigold' : 'lagoon'}
        />
        <p className="mt-2 text-[11.5px] leading-snug text-mist-dim">
          {full ? (
            <>Allotment is full. Join the waitlist from the corridor page.</>
          ) : closed ? (
            <>This block closed at its lock deadline. Nothing further can be pledged.</>
          ) : atFloor ? (
            <>
              Deepest slab reached: Tier III at {rupees(corridor.tier3_fare)} net is the floor the
              carrier contracted, so later pledges pay the same rate as the first ones.
            </>
          ) : needsTierI ? (
            <>
              <span className="tnum text-marigold">{toNext} more seats</span> confirm Tier I at{' '}
              {rupees(tierILanded)} landed. Until then a pledge costs nothing and no card is charged.
            </>
          ) : (
            <>
              <span className="tnum text-marigold">{toNext} more seats</span> reach Tier III at{' '}
              {rupees(corridor.tier3_fare)} net — the saving repriced for everyone already pledged.
            </>
          )}
        </p>
      </div>

      {/* Actions */}
      <footer className="mt-auto flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Link
          to={corridorPath(corridor.code)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill border border-line text-[12.5px] text-mist transition-colors duration-200 hover:border-line-bright hover:text-ivory"
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
                ? 'border-marigold/50 bg-marigold-veil text-marigold'
                : 'border-line text-mist-dim hover:border-line-bright hover:text-ivory',
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
      <span className="tnum display text-[26px] leading-none text-ivory">{code}</span>
      <span className="tnum micro-md text-mist">{time}</span>
      <span className="max-w-[8.5rem] truncate text-[11.5px] text-mist-dim" title={city}>
        {city}
      </span>
      {telugu ? (
        <span className="telugu max-w-[8.5rem] truncate text-[11px] text-mist-faint" lang="te">
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
        'group transition-colors duration-200 hover:bg-night-850',
        closed && 'opacity-60',
      )}
    >
      <td className="px-3 py-2.5">
        <Link
          to={corridorPath(corridor.code)}
          className="micro text-ivory group-hover:text-marigold"
        >
          {corridor.code}
        </Link>
        <span className="mt-0.5 block text-[11px] text-mist-faint">{corridor.festival}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-mist">
          <ModeIcon mode={corridor.mode} size={13} />
          {corridor.origin_code}→{corridor.dest_code}
        </span>
        <span className="tnum mt-0.5 block text-[11px] text-mist-faint">
          {formatDate(corridor.departure_date)} · {corridor.departure_time}
        </span>
      </td>
      <td className="tnum px-3 py-2.5 text-right text-[12.5px] text-mist-faint line-through">
        {rupees(corridor.festival_surge_fare)}
      </td>
      <td className="tnum px-3 py-2.5 text-right text-[13px] font-medium text-ivory">
        {rupees(landedPerSeat(corridor))}
      </td>
      <td className="tnum px-3 py-2.5 text-right text-[12.5px] text-jade">
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
          <span className="tnum micro text-mist-dim">
            {corridor.pledged_seats}/{corridor.total_allotment}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-[11.5px] text-mist-faint">
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
            className="micro inline-flex items-center gap-1 text-mist-dim hover:text-marigold"
          >
            Open <IconArrow size={11} />
          </Link>
        )}
      </td>
    </tr>
  );
}
