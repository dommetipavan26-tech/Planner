import type { Corridor } from '../lib/types';
import { landedPerSeat, rupees, surgeMultiple } from '../lib/format';

interface Bar {
  label: string;
  note: string;
  value: number;
  tone: 'surge' | 'marigold' | 'verdant' | 'ink';
}

/**
 * Hand-built fare ladder for one corridor. No chart library: four bars, a shared
 * baseline and exact rupee labels — the comparison is the whole argument.
 */
export function SurgeChart({ corridor }: { corridor: Corridor }) {
  const bars: Bar[] = [
    {
      label: 'Off-season retail',
      note: 'what this seat costs in a normal week',
      value: corridor.normal_fare,
      tone: 'ink',
    },
    {
      label: 'Festival retail',
      note: `${surgeMultiple(corridor).toFixed(1)}× surge, same seat same day`,
      value: corridor.festival_surge_fare,
      tone: 'surge',
    },
    {
      label: 'Tier I · 15 seats',
      note: 'contracted net fare once the cohort locks',
      value: corridor.tier1_fare + Math.round(corridor.tier1_fare * (corridor.platform_fee_pct / 100)),
      tone: 'marigold',
    },
    {
      label: `Live landed fare · ${corridor.pledged_seats} seats`,
      note: 'group fare + platform fee, right now',
      value: landedPerSeat(corridor),
      tone: 'verdant',
    },
  ];

  const max = Math.max(...bars.map((b) => b.value)) * 1.08;

  const fills: Record<Bar['tone'], string> = {
    ink: 'bg-ink-600',
    surge: 'bg-surge',
    marigold: 'bg-marigold',
    verdant: 'bg-verdant',
  };

  const texts: Record<Bar['tone'], string> = {
    ink: 'text-ink-600',
    surge: 'text-surge',
    marigold: 'text-marigold',
    verdant: 'text-verdant',
  };

  const saving = Math.max(0, corridor.festival_surge_fare - landedPerSeat(corridor));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline-soft pb-2.5">
        <p className="micro text-ink-400">fare ladder · one seat · {corridor.code}</p>
        <p className="tnum font-mono text-[11.5px] text-verdant">
          −{rupees(saving)} vs festival retail
        </p>
      </div>

      <ul className="mt-3 space-y-3">
        {bars.map((bar) => (
          <li key={bar.label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12.5px] font-semibold text-ink">{bar.label}</p>
              <p className={`tnum font-mono text-[13px] font-semibold ${texts[bar.tone]}`}>
                {rupees(bar.value)}
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-[2px] bg-paper-2 ring-1 ring-hairline-soft ring-inset">
              <div
                className={`h-full ${fills[bar.tone]} transition-[width] duration-700 ease-out`}
                style={{ width: `${Math.max(2, (bar.value / max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-400">{bar.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Aggregate surge-vs-group comparison across the whole board. */
export function SurgeSpread({ corridors }: { corridors: Corridor[] }) {
  const rows = [...corridors]
    .map((c) => ({
      code: c.code,
      mode: c.mode,
      surge: c.festival_surge_fare,
      landed: landedPerSeat(c),
      normal: c.normal_fare,
      multiple: surgeMultiple(c),
    }))
    .sort((a, b) => b.multiple - a.multiple);

  const max = Math.max(...rows.map((r) => r.surge), 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline-soft pb-2.5">
        <p className="micro text-ink-400">surge exposure by corridor</p>
        <p className="micro text-ink-400">retail vs landed</p>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.code} className="grid grid-cols-[minmax(88px,auto)_1fr] items-center gap-3">
            <span className="truncate font-mono text-[11px] tracking-[0.02em] text-ink-500">
              {r.code.split('-').slice(0, 2).join('–')}
            </span>
            <span className="relative block h-4">
              <span
                className="absolute inset-y-0 left-0 rounded-[2px] bg-surge/20"
                style={{ width: `${(r.surge / max) * 100}%` }}
              />
              <span
                className="absolute inset-y-[3px] left-0 rounded-[2px] bg-verdant"
                style={{ width: `${(r.landed / max) * 100}%` }}
              />
              <span className="absolute inset-y-0 left-0 w-px bg-ink/45" style={{ left: `${(r.normal / max) * 100}%` }} />
              <span className="tnum absolute top-1/2 right-0 -translate-y-1/2 font-mono text-[10.5px] text-ink-500">
                {r.multiple.toFixed(1)}×
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-hairline-soft pt-2.5">
        <Legend swatch="bg-surge/20" label="festival retail" />
        <Legend swatch="bg-verdant" label="utsavair landed" />
        <Legend swatch="w-px bg-ink/45" label="off-season baseline" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-4 rounded-[1px] ${swatch}`} />
      <span className="micro text-ink-400">{label}</span>
    </span>
  );
}
