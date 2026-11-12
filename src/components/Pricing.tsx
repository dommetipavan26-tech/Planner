import { useMemo } from 'react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import {
  activeTier,
  feeOn,
  landedPerSeat,
  netFareAt,
  pct,
  quote,
  rupees,
  savingPerSeat,
  surgeMultiple,
  tiers,
} from '../lib/format';
import type { Corridor } from '../lib/types';
import { Chip, cn } from './ui';
import { IconCheck, IconSpark } from './icons';

/**
 * The three price slabs, with the one the cohort currently sits in marked and
 * the one it is walking towards highlighted. Honest by construction: a slab
 * below the cohort's size is labelled indicative, never locked.
 */
export function TierLadder({
  corridor,
  projectedSeats,
  compact,
}: {
  corridor: Corridor;
  projectedSeats?: number;
  compact?: boolean;
}) {
  const slab = tiers(corridor);
  const seats = projectedSeats ?? corridor.pledged_seats;
  const projectedNet = netFareAt(corridor, seats);

  return (
    <ol className={cn('grid gap-2', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-3')}>
      {slab.map((tier) => {
        const reached = seats >= tier.min;
        const isProjected = tier.net === projectedNet;
        return (
          <li
            key={tier.id}
            aria-current={isProjected ? 'true' : undefined}
            className={cn(
              'relative flex flex-col gap-2 rounded-card border px-3 py-2.5 transition-colors duration-300 ease-out-expo',
              isProjected
                ? 'border-marigold/55 bg-marigold-veil/60'
                : reached
                  ? 'border-line-bright bg-night-850'
                  : 'border-line bg-night-900/60',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('micro', isProjected ? 'text-marigold' : 'text-mist-dim')}>
                {tier.label}
              </span>
              {reached ? (
                <span className="inline-flex items-center gap-1 text-jade" title="Threshold met">
                  <IconCheck size={12} />
                  <span className="micro">met</span>
                </span>
              ) : (
                <span className="tnum micro text-mist-faint">
                  {Math.max(0, tier.min - seats)} to go
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="tnum text-[19px] font-medium leading-none text-ivory">
                {rupees(tier.net)}
              </span>
              <span className="micro text-mist-faint">net</span>
            </div>
            <dl className="flex flex-col gap-0.5 text-[11px] leading-snug text-mist-dim">
              <div className="flex justify-between gap-2">
                <dt>at {tier.min}+ seats</dt>
                <dd className="tnum text-mist">
                  {rupees(tier.fee)} fee
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Landed</dt>
                <dd className="tnum text-ivory">{rupees(tier.landed)}</dd>
              </div>
            </dl>
            {isProjected ? (
              <span className="absolute -top-px left-3 h-px w-8 bg-marigold" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Price anatomy: one bar, three segments — what a walk-up festival fare costs,
 * what the pooled group fare costs, and where the platform fee sits inside it.
 * Widths are proportional to rupees, so the saving is visible without reading.
 */
export function PriceAnatomy({
  corridor,
  projectedSeats,
}: {
  corridor: Corridor;
  projectedSeats?: number;
}) {
  const seats = projectedSeats ?? corridor.pledged_seats;
  const net = netFareAt(corridor, seats);
  const fee = feeOn(net, corridor.platform_fee_pct);
  const landed = net + fee;
  const surge = corridor.festival_surge_fare;
  const normal = corridor.normal_fare;
  const scale = Math.max(surge, landed, normal) || 1;

  const animatedLanded = useAnimatedNumber(landed);
  const animatedNet = useAnimatedNumber(net);

  const segments = useMemo(
    () => [
      { key: 'net', label: 'Carrier net', value: animatedNet, className: 'bg-marigold' },
      { key: 'fee', label: 'Platform fee', value: fee, className: 'bg-clay' },
    ],
    [animatedNet, fee],
  );

  return (
    <div className="flex flex-col gap-3.5">
      <Row
        label="Festival surge fare"
        hint="what the same seat costs on a public booking engine"
        value={surge}
        scale={scale}
        tone="ember"
      />
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-2">
            <span className="text-[12.5px] text-ivory">Pooled group fare</span>
            <span className="micro text-mist-faint">at {seats} pledged seats</span>
          </span>
          <span className="tnum text-[13px] font-medium text-ivory">
            {rupees(Math.round(animatedLanded))}
          </span>
        </div>
        <div
          className="flex h-[10px] w-full overflow-hidden rounded-pill bg-night-800"
          role="img"
          aria-label={`Pooled group fare ${rupees(landed)} per seat: carrier net ${rupees(net)} plus ${pct(corridor.platform_fee_pct, 1)} platform fee ${rupees(fee)}`}
        >
          {segments.map((seg) => (
            <span
              key={seg.key}
              className={cn('h-full transition-[width] duration-500 ease-out-expo', seg.className)}
              style={{ width: `${(seg.value / scale) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Swatch className="bg-marigold" label={`Carrier net ${rupees(net)}`} />
          <Swatch
            className="bg-clay"
            label={`Platform fee ${rupees(fee)} · ${pct(corridor.platform_fee_pct, 1)}`}
          />
        </div>
      </div>
      <Row
        label="Off-season fare"
        hint="the same corridor outside the festival window"
        value={normal}
        scale={scale}
        tone="lagoon"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-night-850 px-3 py-2.5">
        <p className="text-[11.5px] leading-snug text-mist-dim">
          Surge multiple{' '}
          <span className="tnum text-ember">{surgeMultiple(corridor).toFixed(1)}×</span> · you keep{' '}
          <span className="tnum text-jade">{rupees(savingPerSeat(corridor))}</span> per seat at the
          current slab.
        </p>
        <Chip tone="jade" dot={activeTier(corridor) >= 1}>
          {activeTier(corridor) >= 1 ? `Tier ${activeTier(corridor)} live` : 'Tier I pending'}
        </Chip>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  scale,
  tone,
}: {
  label: string;
  hint: string;
  value: number;
  scale: number;
  tone: 'ember' | 'lagoon';
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[12.5px] text-mist">{label}</span>
          <span className="hidden text-[11px] text-mist-faint sm:inline">{hint}</span>
        </span>
        <span className="tnum text-[13px] text-mist">{rupees(value)}</span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-pill bg-night-800" aria-hidden="true">
        <span
          className={cn(
            'block h-full rounded-pill transition-[width] duration-500 ease-out-expo',
            tone === 'ember' ? 'bg-ember/70' : 'bg-lagoon/60',
          )}
          style={{ width: `${(value / scale) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-[2px]', className)} aria-hidden="true" />
      <span className="tnum text-[11px] text-mist-dim">{label}</span>
    </span>
  );
}

/** Line-by-line money for a specific pledge size. */
export function QuoteBreakdown({
  corridor,
  seats,
}: {
  corridor: Corridor;
  seats: number;
}) {
  const q = useMemo(() => quote(corridor, seats), [corridor, seats]);
  const landed = useAnimatedNumber(q.landedPerSeat);
  const total = useAnimatedNumber(q.total);
  const saving = useAnimatedNumber(q.totalSaving);

  const rows: Array<[string, string, string?]> = [
    [`Carrier net fare × ${seats}`, rupees(q.unitFare * seats)],
    [
      `Platform fee · ${pct(corridor.platform_fee_pct, 1)}`,
      rupees(q.feePerSeat * seats),
      'charged once, at lock',
    ],
    ['Escrow hold today', rupees(0), 'nothing is captured until Tier I clears'],
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <dl className="flex flex-col gap-1.5">
        {rows.map(([label, value, note]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="flex min-w-0 flex-col">
              <span className="truncate text-[12px] text-mist">{label}</span>
              {note ? <span className="text-[10.5px] text-mist-faint">{note}</span> : null}
            </dt>
            <dd className="tnum shrink-0 text-[12.5px] text-ivory">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="perforation h-px w-full" aria-hidden="true" />

      <div className="flex items-baseline justify-between gap-3">
        <span className="micro text-mist-dim">Landed per seat</span>
        <span className="tnum text-[15px] font-medium text-ivory">{rupees(Math.round(landed))}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="micro text-mist-dim">Payable at lock</span>
        <span className="tnum display text-[26px] leading-none text-marigold">
          {rupees(Math.round(total))}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-card border border-jade-line bg-jade-veil px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-jade">
          <IconSpark size={13} />
          Saved against surge
        </span>
        <span className="tnum text-[14px] font-medium text-jade">
          {rupees(Math.round(saving))}
        </span>
      </div>
      {q.seatsToNextTier > 0 ? (
        <p className="text-[11.5px] leading-snug text-mist-dim">
          {q.seatsToNextTier} more pledged seat{q.seatsToNextTier === 1 ? '' : 's'} on this corridor
          drop everyone to the next slab — worth{' '}
          <span className="tnum text-marigold">{rupees(q.nextTierSaving)}</span> to your party.
        </p>
      ) : (
        <p className="text-[11.5px] leading-snug text-jade">
          Deepest slab reached. This is the floor the carrier has contracted.
        </p>
      )}
    </div>
  );
}

/** What a seat costs right now, as a single self-contained figure. */
export function LandedFigure({ corridor }: { corridor: Corridor }) {
  const value = useAnimatedNumber(landedPerSeat(corridor));
  return (
    <span className="tnum display text-[30px] leading-none text-ivory">
      {rupees(Math.round(value))}
    </span>
  );
}
