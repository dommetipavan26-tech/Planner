import type { Corridor } from '../lib/types';
import {
  activeUnitFare,
  compactRupees,
  countdown,
  fillPct,
  formatDate,
  landedPerSeat,
  rupees,
  seatRemaining,
  surgeMultiple,
} from '../lib/format';
import { StatusDot, Tag } from './ui';

function statusTone(c: Corridor): 'marigold' | 'verdant' | 'sky' {
  if (c.pledged_seats >= c.tier3_min) return 'verdant';
  if (c.pledged_seats >= c.tier1_min) return 'sky';
  return 'marigold';
}

function statusLabel(c: Corridor): string {
  if (c.allotment_status === 'issued') return 'issued';
  if (c.pledged_seats >= c.tier3_min) return 'tier iii locked';
  if (c.pledged_seats >= c.tier2_min) return 'tier ii locked';
  if (c.pledged_seats >= c.tier1_min) return 'tier i locked';
  return 'collecting';
}

/**
 * Departure-board panel. Deliberately dark, monospaced and dense — it reads as
 * an operations board rather than a marketing card.
 */
export function LiveBoard({
  corridors,
  live,
  onOpen,
}: {
  corridors: Corridor[];
  live: boolean;
  onOpen: (c: Corridor) => void;
}) {
  const sorted = [...corridors].sort(
    (a, b) =>
      new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-card border border-ink bg-ink text-paper shadow-[0_24px_60px_-40px_rgba(11,14,20,0.9)]">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
        <p className="micro flex items-center gap-2 text-ink-300">
          <StatusDot tone={live ? 'verdant' : 'marigold'} pulse={live} />
          corridor board · {sorted.length} live blocks
        </p>
        <p className="micro text-ink-400">ist</p>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 border-b border-ink-800 px-4 py-1.5 sm:grid-cols-[auto_1fr_auto_auto_auto]">
        <span className="micro text-ink-400">svc</span>
        <span className="micro text-ink-400">corridor</span>
        <span className="micro hidden text-ink-400 sm:block">seats</span>
        <span className="micro text-right text-ink-400">landed</span>
        <span className="micro text-right text-ink-400">status</span>
      </div>

      <ul className="divide-y divide-ink-800">
        {sorted.map((c) => {
          const remaining = seatRemaining(c);
          const tone = statusTone(c);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-800 sm:grid-cols-[auto_1fr_auto_auto_auto]"
              >
                <span className="font-mono text-[11px] tracking-[0.06em] text-ink-300">
                  {c.service_number}
                </span>

                <span className="min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    <span className="tnum font-mono text-[13px] font-semibold tracking-[0.04em] text-paper">
                      {c.origin_code}
                    </span>
                    <svg viewBox="0 0 24 8" className="h-2 w-5 shrink-0 text-ink-400" aria-hidden="true">
                      <path d="M0 4h20M17 1l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1" />
                    </svg>
                    <span className="tnum font-mono text-[13px] font-semibold tracking-[0.04em] text-paper">
                      {c.dest_code}
                    </span>
                    <span className="micro ml-1 text-ink-400">{c.mode}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-300">
                    {formatDate(c.departure_date)} · {c.departure_time} · {c.carrier_name}
                  </span>
                </span>

                <span className="hidden text-right sm:block">
                  <span className="tnum font-mono text-[12px] text-paper">
                    {c.pledged_seats}
                    <span className="text-ink-400">/{c.total_allotment}</span>
                  </span>
                  <span className="mt-1 block h-[3px] w-16 overflow-hidden rounded-[2px] bg-ink-700">
                    <span
                      className={`block h-full ${tone === 'verdant' ? 'bg-[#59b98a]' : tone === 'sky' ? 'bg-[#7fb0d8]' : 'bg-marigold-bright'}`}
                      style={{ width: `${fillPct(c)}%` }}
                    />
                  </span>
                </span>

                <span className="text-right">
                  <span className="tnum font-mono text-[12.5px] font-semibold text-paper">
                    {rupees(landedPerSeat(c))}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-surge-soft/70 line-through">
                    {rupees(c.festival_surge_fare)}
                  </span>
                </span>

                <span className="text-right">
                  <span
                    className={`micro ${
                      tone === 'verdant'
                        ? 'text-[#8fd6b0]'
                        : tone === 'sky'
                          ? 'text-[#a8cbe8]'
                          : 'text-[#f0b57a]'
                    }`}
                  >
                    {statusLabel(c)}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-ink-400">
                    {remaining > 0 ? `${remaining} left` : 'block full'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700 px-4 py-2">
        <p className="font-mono text-[10.5px] text-ink-400">
          landed = contracted group fare + platform fee · surge = current retail one-way
        </p>
        <p className="micro text-ink-300">tap a row for the tier ladder</p>
      </div>
    </div>
  );
}

export function BoardHighlights({ corridors }: { corridors: Corridor[] }) {
  const best = [...corridors].sort(
    (a, b) =>
      b.festival_surge_fare - landedPerSeat(b) - (a.festival_surge_fare - landedPerSeat(a)),
  )[0];
  const closing = [...corridors].sort(
    (a, b) => new Date(a.lock_deadline).getTime() - new Date(b.lock_deadline).getTime(),
  )[0];

  return (
    <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2">
      {best ? (
        <div className="bg-paper-3 px-4 py-3">
          <p className="micro text-ink-400">deepest saving on the board</p>
          <p className="mt-1.5 font-mono text-[12.5px] font-semibold tracking-[0.04em] text-ink">
            {best.origin_code} → {best.dest_code}
          </p>
          <p className="tnum font-display mt-1 text-[24px] leading-none text-verdant">
            {rupees(Math.max(0, best.festival_surge_fare - landedPerSeat(best)))}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-500">
            per seat against a {surgeMultiple(best).toFixed(1)}× festival surge of{' '}
            {rupees(best.festival_surge_fare)} retail.
          </p>
        </div>
      ) : null}
      {closing ? (
        <div className="bg-paper-3 px-4 py-3">
          <p className="micro text-ink-400">next allotment lock</p>
          <p className="mt-1.5 font-mono text-[12.5px] font-semibold tracking-[0.04em] text-ink">
            {closing.code}
          </p>
          <p className="tnum font-display mt-1 text-[24px] leading-none text-marigold">
            {countdown(closing.lock_deadline)}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-500">
            {closing.pledged_seats} of {closing.total_allotment} seats pledged ·{' '}
            {compactRupees(activeUnitFare(closing))} net group fare held against{' '}
            {closing.contract_ref}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ModeTag({ mode }: { mode: Corridor['mode'] }) {
  return mode === 'flight' ? (
    <Tag tone="sky">air · group pnr</Tag>
  ) : (
    <Tag tone="road">coach · chartered</Tag>
  );
}
