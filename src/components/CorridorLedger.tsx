import { useMemo, useState } from 'react';
import type { Corridor } from '../lib/types';
import {
  activeUnitFare,
  countdown,
  feePerSeat,
  fillPct,
  formatDate,
  formatDay,
  landedPerSeat,
  rupees,
  seatRemaining,
  surgeMultiple,
  tiersFor,
} from '../lib/format';
import { ModeTag } from './LiveBoard';
import { Button, Segmented, Select, TextInput, TierMeter } from './ui';

type ModeFilter = 'all' | 'flight' | 'bus';
type SortKey = 'departure' | 'saving' | 'fill' | 'surge';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'departure', label: 'Departure date' },
  { value: 'saving', label: 'Saving per seat' },
  { value: 'fill', label: 'Cohort fill' },
  { value: 'surge', label: 'Surge multiple' },
];

export function CorridorLedger({
  corridors,
  onOpen,
  searchRef,
}: {
  corridors: Corridor[];
  onOpen: (c: Corridor) => void;
  searchRef?: (el: HTMLDivElement | null) => void;
}) {
  const [mode, setMode] = useState<ModeFilter>('all');
  const [festival, setFestival] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('departure');

  const festivals = useMemo(
    () => Array.from(new Set(corridors.map((c) => c.festival))).sort(),
    [corridors],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = corridors.filter((c) => {
      if (mode !== 'all' && c.mode !== mode) return false;
      if (festival !== 'all' && c.festival !== festival) return false;
      if (!q) return true;
      return [c.code, c.origin_city, c.dest_city, c.origin_code, c.dest_code, c.carrier_name]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'saving':
          return (
            b.festival_surge_fare - landedPerSeat(b) - (a.festival_surge_fare - landedPerSeat(a))
          );
        case 'fill':
          return fillPct(b) - fillPct(a);
        case 'surge':
          return surgeMultiple(b) - surgeMultiple(a);
        default:
          return (
            new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime() ||
            a.departure_time.localeCompare(b.departure_time)
          );
      }
    });
    return sorted;
  }, [corridors, mode, festival, query, sort]);

  return (
    <div ref={searchRef} className="scroll-mt-24">
      <div className="flex flex-col gap-3 border-b border-hairline pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<ModeFilter>
            ariaLabel="Travel mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'all', label: 'All', count: corridors.length },
              { value: 'flight', label: 'Air', count: corridors.filter((c) => c.mode === 'flight').length },
              { value: 'bus', label: 'Coach', count: corridors.filter((c) => c.mode === 'bus').length },
            ]}
          />
          <Select
            aria-label="Festival window"
            value={festival}
            onChange={(e) => setFestival(e.target.value)}
            className="h-8 w-auto min-w-[190px] text-[12px]"
          >
            <option value="all">All festival windows</option>
            {festivals.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search corridor, city or carrier"
            aria-label="Search corridors"
            className="h-8 w-full text-[12px] sm:w-[240px]"
          />
          <Select
            aria-label="Sort corridors"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 w-auto min-w-[168px] text-[12px]"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.65fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_minmax(0,1.25fr)_auto] gap-x-4 border-b border-hairline-soft py-2 lg:grid">
        <span className="micro text-ink-400">corridor</span>
        <span className="micro text-ink-400">departs</span>
        <span className="micro text-ink-400">retail vs landed</span>
        <span className="micro text-ink-400">cohort status</span>
        <span className="micro text-right text-ink-400">allotment</span>
      </div>

      <ul className="divide-y divide-hairline-soft">
        {rows.map((c) => (
          <CorridorRow key={c.id} corridor={c} onOpen={onOpen} />
        ))}
        {rows.length === 0 ? (
          <li className="py-12 text-center">
            <p className="font-display text-[17px] text-ink">No corridor matches those filters.</p>
            <p className="mt-1 text-[12.5px] text-ink-400">
              Request one on the demand board — we open blocks where cohorts already exist.
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function CorridorRow({ corridor: c, onOpen }: { corridor: Corridor; onOpen: (c: Corridor) => void }) {
  const remaining = seatRemaining(c);
  const saving = Math.max(0, c.festival_surge_fare - landedPerSeat(c));
  const nextTier = tiersFor(c).find((t) => !t.reached);
  const seatsToNext = nextTier ? Math.max(0, nextTier.min - c.pledged_seats) : 0;
  const full = remaining === 0;

  return (
    <li>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 py-3.5 transition-colors hover:bg-paper-2 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_minmax(0,1.25fr)_auto] lg:items-center lg:py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-400">{c.code}</span>
            <ModeTag mode={c.mode} />
          </div>
          <p className="mt-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
            {c.origin_city} <span className="text-ink-300">→</span> {c.dest_city}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-ink-400">
            {c.carrier_name} · {c.service_number} · {c.festival}
          </p>
        </div>

        <div>
          <CellLabel>departs</CellLabel>
          <p className="tnum text-[13px] font-semibold text-ink">
            {formatDay(c.departure_date)} {formatDate(c.departure_date)}
          </p>
          <p className="tnum mt-0.5 font-mono text-[11.5px] text-ink-500">
            {c.departure_time} → {c.arrival_time} · {c.duration_label}
          </p>
        </div>

        <div>
          <CellLabel>retail vs landed</CellLabel>
          <p className="tnum font-mono text-[11.5px] text-surge line-through">
            {rupees(c.festival_surge_fare)}
          </p>
          <p className="tnum font-mono text-[15px] font-semibold text-verdant">
            {rupees(landedPerSeat(c))}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            save {rupees(saving)} · fee {rupees(feePerSeat(c))} ({c.platform_fee_pct}%)
          </p>
        </div>

        <div>
          <CellLabel>cohort status</CellLabel>
          <div className="flex items-baseline justify-between gap-2">
            <p className="tnum font-mono text-[12px] text-ink">
              {c.pledged_seats}
              <span className="text-ink-400">/{c.total_allotment} pledged</span>
            </p>
            <p className="tnum font-mono text-[10.5px] text-ink-400">
              lock in {countdown(c.lock_deadline)}
            </p>
          </div>
          <div className="mt-1.5">
            <TierMeter
              pledged={c.pledged_seats}
              total={c.total_allotment}
              gates={[c.tier1_min, c.tier2_min, c.tier3_min]}
              compact
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-400">
            {nextTier
              ? `${seatsToNext} more seat${seatsToNext === 1 ? '' : 's'} to ${nextTier.label} · ${rupees(nextTier.landed)} landed`
              : `Best slab live · ${rupees(activeUnitFare(c))} net group fare`}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <CellLabel className="lg:hidden">allotment</CellLabel>
          <div className="text-right">
            <p className="tnum font-mono text-[11px] text-ink-400">
              {full ? 'block full' : `${remaining} seat${remaining === 1 ? '' : 's'} left`}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-300 uppercase">
              {c.contract_ref}
            </p>
          </div>
          <Button
            size="sm"
            variant={full ? 'outline' : 'primary'}
            onClick={() => onOpen(c)}
            className="shrink-0"
          >
            {full ? 'Waitlist' : 'Join cohort'}
          </Button>
        </div>
      </div>
    </li>
  );
}

function CellLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`micro mb-1 text-ink-300 lg:hidden ${className}`}>{children}</p>
  );
}
