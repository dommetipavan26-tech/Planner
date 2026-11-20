import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Ledger } from '../hooks/useLedger';
import { Link } from '../lib/router';
import { useCoarseNow } from '../hooks/useClock';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import {
  compactRupees,
  daysUntil,
  formatDate,
  isClosed,
  isFull,
  number,
  pct,
  rupees,
  savingPct,
  seatsLeft,
  surgeMultiple,
} from '../lib/format';
import type { Corridor, TravelMode } from '../lib/types';
import {
  Button,
  Chip,
  ClockStamp,
  Disclosure,
  EmptyState,
  Eyebrow,
  Reveal,
  Segmented,
  SelectInput,
  StatsCard,
  type StatsGradient,
  TextInput,
  cn,
} from '../components/ui';
import { CorridorCard, CorridorRow } from '../components/CorridorCard';
import { CorridorRail, NetworkMap } from '../components/NetworkMap';
import { FeeDisclosure, HowItWorks, RefundRule, Section, TierExplainer } from '../components/Explainers';
import {
  IconArrow,
  IconClose,
  IconGauge,
  IconGrid,
  IconRoute,
  IconSearch,
  IconShield,
  IconSpark,
  IconTable,
  IconTicket,
  IconUsers,
} from '../components/icons';

/** "4.5%" or "4.0–4.5%" — never a hardcoded fee in the copy. */
function feeSpan(values: number[]): string | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? pct(min, 1) : `${pct(min, 1)}–${pct(max, 1)}`;
}

type SortKey = 'departure' | 'saving' | 'fill' | 'surge' | 'open';
type ModeFilter = 'all' | TravelMode;
type ViewMode = 'grid' | 'table';

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'departure', label: 'Departure date' },
  { value: 'saving', label: 'Saving vs surge' },
  { value: 'fill', label: 'Cohort fill' },
  { value: 'surge', label: 'Surge multiple' },
  { value: 'open', label: 'Seats still open' },
];

export function CorridorsView({
  ledger,
  onHold,
  onWatch,
  watchingId,
}: {
  ledger: Ledger;
  onHold: (corridor: Corridor) => void;
  onWatch: (corridor: Corridor) => void;
  watchingId?: string | null;
}) {
  const now = useCoarseNow();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [sort, setSort] = useState<SortKey>('departure');
  const [hideClosed, setHideClosed] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');

  const { corridors, totals, isWatched } = ledger;

  const flagship = useMemo(
    () =>
      corridors.find((c) => c.code === 'VGA-DEL-SK27') ??
      [...corridors].sort((a, b) => savingPct(b) - savingPct(a))[0],
    [corridors],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = corridors.filter((c) => {
      if (mode !== 'all' && c.mode !== mode) return false;
      if (hideClosed && (isClosed(c, now) || isFull(c))) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.origin_city.toLowerCase().includes(q) ||
        c.origin_code.toLowerCase().includes(q) ||
        c.dest_city.toLowerCase().includes(q) ||
        c.dest_code.toLowerCase().includes(q) ||
        c.carrier_name.toLowerCase().includes(q) ||
        c.festival.toLowerCase().includes(q) ||
        c.service_number.toLowerCase().includes(q)
      );
    });

    const by: Record<SortKey, (a: Corridor, b: Corridor) => number> = {
      departure: (a, b) =>
        a.departure_date.localeCompare(b.departure_date) || a.departure_time.localeCompare(b.departure_time),
      saving: (a, b) => savingPct(b) - savingPct(a),
      fill: (a, b) => b.pledged_seats / b.total_allotment - a.pledged_seats / a.total_allotment,
      surge: (a, b) => surgeMultiple(b) - surgeMultiple(a),
      open: (a, b) => seatsLeft(b) - seatsLeft(a),
    };
    return [...rows].sort(by[sort]);
  }, [corridors, query, mode, hideClosed, sort, now]);

  const nextDeparture = useMemo(
    () =>
      [...corridors]
        .filter((c) => !isClosed(c, now))
        .sort((a, b) => a.departure_date.localeCompare(b.departure_date))[0],
    [corridors, now],
  );

  const filtersActive = query.trim() !== '' || mode !== 'all' || hideClosed;
  const clearFilters = useCallback(() => {
    setQuery('');
    setMode('all');
    setHideClosed(false);
  }, []);

  return (
    <>
      <Hero
        totals={totals}
        nextDeparture={nextDeparture}
        corridors={corridors}
        now={now}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-14 px-4 py-12 sm:px-6 lg:gap-20 lg:py-16">
        <StatsBar totals={totals} />

        <Section
          id="board"
          eyebrow="Live board"
          title="Corridors open for pledges"
          lede="Every figure below is read from the same Postgres rows the carrier desk sees. Seat counts, slabs and countdowns move in realtime; nothing here is a cached screenshot."
          aside={
            <div className="flex items-center gap-2">
              <Segmented
                label="Board layout"
                value={view}
                onChange={setView}
                options={[
                  { value: 'grid', label: 'Cards', icon: <IconGrid size={13} /> },
                  { value: 'table', label: 'Compare', icon: <IconTable size={13} /> },
                ]}
              />
            </div>
          }
        >
          <FilterBar
            query={query}
            onQuery={setQuery}
            mode={mode}
            onMode={setMode}
            sort={sort}
            onSort={setSort}
            hideClosed={hideClosed}
            onHideClosed={setHideClosed}
            count={filtered.length}
            total={corridors.length}
            onClear={clearFilters}
            filtersActive={filtersActive}
          />

          {filtered.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<IconSearch size={22} />}
                as="h2"
                title="No corridor matches that"
                body={
                  filtersActive
                    ? 'Try a different city, carrier code or festival — or clear the filters to see the whole board.'
                    : 'No festival corridors are open right now. Request a route and our carrier desk will contract a block.'
                }
                action={
                  filtersActive ? (
                    <Button size="md" variant="primary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Link
                      to="/requests"
                      className="inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-5 text-[13px] font-medium text-on-accent transition-colors duration-200 hover:bg-accent-bright"
                    >
                      Request a corridor <IconArrow size={13} />
                    </Link>
                  )
                }
              />
            </div>
          ) : view === 'grid' ? (
            <ul className="mt-6 grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((corridor, i) => (
                <Reveal key={corridor.id} as="li" variant="scale" delay={Math.min(i, 6) * 55}>
                  <CorridorCard
                    corridor={corridor}
                    watched={isWatched(corridor.id)}
                    watchingBusy={watchingId === corridor.id}
                    onWatch={onWatch}
                    onHold={isClosed(corridor, now) || isFull(corridor) ? undefined : onHold}
                  />
                </Reveal>
              ))}
            </ul>
          ) : (
            <CompareTable corridors={filtered} onHold={onHold} now={now} />
          )}
        </Section>

        <LatestHolds ledger={ledger} />
        <HowItWorks />
        <TierExplainer corridor={flagship} />
        <FeeDisclosure corridor={flagship} />
        <RefundRule corridor={flagship} />
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- hero */

function Hero({
  totals,
  nextDeparture,
  corridors,
  now,
}: {
  totals: Ledger['totals'];
  nextDeparture: Corridor | undefined;
  corridors: Corridor[];
  now: number;
}) {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = heroRef.current;
    if (!node) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      const ratio = Math.min(1, Math.max(0, window.scrollY / 520));
      node.style.setProperty('--hero-scroll', ratio.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const airFee = feeSpan(corridors.filter((c) => c.mode === 'flight').map((c) => c.platform_fee_pct));
  const coachFee = feeSpan(corridors.filter((c) => c.mode === 'bus').map((c) => c.platform_fee_pct));
  const feeCopy =
    airFee && coachFee
      ? `${airFee} air · ${coachFee} coach fee, disclosed`
      : airFee
        ? `${airFee} platform fee, disclosed`
        : 'Platform fee disclosed on every figure';

  return (
    <section ref={heroRef} className="relative overflow-hidden border-b border-rule">
      <div
        className="glow-accent hero-parallax-slow pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="grid-veil hero-parallax-fast pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid w-full max-w-[1400px] gap-10 px-4 pt-12 pb-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-16 lg:pb-20">
        <div className="flex flex-col gap-6">
          <div className="startup-rise startup-1 flex flex-wrap items-center gap-2">
            <Chip tone="marigold" dot>
              Sankranti 2027 corridor desk
            </Chip>
            {nextDeparture ? (
              <Chip tone="neutral">
                next departure in {daysUntil(nextDeparture.departure_date + 'T00:00:00+05:30', now)}d
              </Chip>
            ) : null}
          </div>

          <h1 className="startup-rise startup-2 display text-[clamp(2.5rem,6.2vw,4.75rem)] text-ink">
            The festival surge is <em className="text-accent-deep">negotiable</em> — if enough of you ask
            at once.
          </h1>

          <p className="startup-rise startup-3 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
            Carriers contract a block of seats for one departure. Travellers pledge into it. The moment
            a threshold clears, every pledged seat reprices down — including the ones that joined
            first. No card is charged until the block confirms.
          </p>

          <div className="startup-rise startup-3 flex flex-wrap items-center gap-3">
            <a
              href="#board"
              className="inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-5 text-[13.5px] font-medium text-on-accent shadow-accent-lift transition-colors duration-200 hover:bg-accent-bright"
            >
              See the live board
              <IconArrow size={14} />
            </a>
            <a
              href="#how"
              className="inline-flex h-11 items-center gap-2 rounded-pill border border-rule-strong px-5 text-[13.5px] text-ink-soft transition-colors duration-200 hover:border-rule-strongest hover:text-ink"
            >
              How a pledge works
            </a>
          </div>

          <ul className="startup-rise startup-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <TrustItem icon={<IconShield size={13} />} text="Nothing is charged until the block confirms" />
            <TrustItem icon={<IconGauge size={13} />} text={feeCopy} />
            <TrustItem icon={<IconUsers size={13} />} text={`${number(totals.seatsAllotted)} seats under contract`} />
          </ul>
        </div>

        <div className="startup-rise startup-5 flex flex-col gap-4">
          <NetworkMap corridors={corridors} />
          <div className="rounded-card border border-rule bg-surface/80 p-4">
            <Eyebrow>Busiest right now</Eyebrow>
            <div className="mt-3">
              <CorridorRail corridors={corridors} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
      <span className="text-jade-deep">{icon}</span>
      {text}
    </li>
  );
}

/* -------------------------------------------------------------------- stats */

function StatsBar({ totals }: { totals: Ledger['totals'] }) {
  const pledged = useAnimatedNumber(totals.seatsPledged);
  const saved = useAnimatedNumber(totals.savings);
  const fill = useAnimatedNumber(totals.fillRate);
  const gmv = useAnimatedNumber(totals.gmv);

  const stats: Array<{
    title: string;
    value: string;
    change: string;
    changeTone: 'jade' | 'marigold' | 'lagoon' | 'clay' | 'neutral';
    gradient: StatsGradient;
    icon: ReactNode;
  }> = [
    {
      title: 'Corridors live',
      value: number(totals.corridors),
      change: `${totals.tierLocked} past Tier I`,
      changeTone: 'lagoon',
      gradient: 'lagoon',
      icon: <IconRoute size={20} />,
    },
    {
      title: 'Seats pledged',
      value: number(Math.round(pledged)),
      change: `of ${number(totals.seatsAllotted)} contracted`,
      changeTone: 'marigold',
      gradient: 'marigold',
      icon: <IconUsers size={20} />,
    },
    {
      title: 'Cohort fill',
      value: pct(Math.round(fill)),
      change: 'across all blocks',
      changeTone: 'neutral',
      gradient: 'ink',
      icon: <IconGauge size={20} />,
    },
    {
      title: 'Traveller saving',
      value: compactRupees(Math.round(saved)),
      change: 'vs published surge fares',
      changeTone: 'jade',
      gradient: 'jade',
      icon: <IconSpark size={20} />,
    },
    {
      title: 'Booking value',
      value: compactRupees(Math.round(gmv)),
      change: 'at current slabs',
      changeTone: 'neutral',
      gradient: 'ink',
      icon: <IconTicket size={20} />,
    },
    {
      title: 'Platform fee',
      value: compactRupees(Math.round(totals.fees)),
      change: 'retained on confirmed blocks',
      changeTone: 'clay',
      gradient: 'clay',
      icon: <IconShield size={20} />,
    },
  ];

  return (
    <Reveal variant="scale">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatsCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            change={stat.change}
            changeTone={stat.changeTone}
            icon={stat.icon}
            gradient={stat.gradient}
          />
        ))}
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ filters */

function FilterBar({
  query,
  onQuery,
  mode,
  onMode,
  sort,
  onSort,
  hideClosed,
  onHideClosed,
  count,
  total,
  onClear,
  filtersActive,
}: {
  query: string;
  onQuery: (v: string) => void;
  mode: ModeFilter;
  onMode: (v: ModeFilter) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  hideClosed: boolean;
  onHideClosed: (v: boolean) => void;
  count: number;
  total: number;
  onClear: () => void;
  filtersActive: boolean;
}) {
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? 'Departure date';

  return (
    <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface/70 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <TextInput
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search city, station code, carrier or festival"
            aria-label="Search corridors"
            className="pl-9 pr-12"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-pill text-ink-faint transition-colors duration-200 hover:bg-sunken hover:text-ink"
            >
              <IconClose size={14} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented
            label="Travel mode"
            value={mode}
            onChange={onMode}
            options={[
              { value: 'all', label: 'All' },
              { value: 'flight', label: 'Air' },
              { value: 'bus', label: 'Coach' },
            ]}
          />

          <p className="tnum micro shrink-0 text-ink-faint lg:border-l lg:border-rule lg:pl-3">
            {count} of {total} shown
          </p>

          {filtersActive ? (
            <Button size="sm" variant="quiet" onClick={onClear}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <Disclosure
        label="Sort & availability filters"
        summary={`${sortLabel}${hideClosed ? ' · open blocks only' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="micro text-ink-muted" htmlFor="board-sort">
              Sort by
            </label>
            <SelectInput
              id="board-sort"
              value={sort}
              onChange={(e) => onSort(e.target.value as SortKey)}
              className="w-auto min-w-[10.5rem]"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </div>
          <button
            type="button"
            onClick={() => onHideClosed(!hideClosed)}
            aria-pressed={hideClosed}
            className={cn(
              'min-h-11 rounded-pill border px-4 text-[12.5px] transition-colors duration-200',
              hideClosed
                ? 'border-accent/50 bg-accent-tint text-accent-deep'
                : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink-soft',
            )}
          >
            {hideClosed ? 'Showing open only' : 'Hide closed blocks'}
          </button>
        </div>
      </Disclosure>
    </div>
  );
}

/* -------------------------------------------------------------------- table */

function CompareTable({
  corridors,
  onHold,
  now,
}: {
  corridors: Corridor[];
  onHold: (corridor: Corridor) => void;
  now: number;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-card border border-rule">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <caption className="sr-only">
            Comparison of {corridors.length} festival corridors: surge fare, pooled landed fare,
            saving, cohort fill and lock countdown
          </caption>
          <thead className="bg-raised">
            <tr className="micro text-ink-faint">
              <th scope="col" className="px-3 py-2.5 font-medium">Corridor</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Route</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Surge</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Landed</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Saving</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Cohort</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Lock in</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule-soft bg-surface">
            {corridors.map((corridor) => (
              <CorridorRow
                key={corridor.id}
                corridor={corridor}
                onOpen={isClosed(corridor, now) || isFull(corridor) ? undefined : onHold}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-rule bg-surface px-3 py-2 text-[11px] text-ink-faint">
        Landed = carrier net fare at the corridor’s current slab, plus that corridor’s platform fee —
        stated on every card and never folded into the fare. Scroll sideways on small screens.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- latest holds */

function LatestHolds({ ledger }: { ledger: Ledger }) {
  const rows = ledger.roster.slice(0, 8);

  const corridorFor = (id: string) => ledger.corridors.find((c) => c.id === id);

  return (
    <Section
      eyebrow="Ledger activity"
      title="Latest holds"
      lede="The most recent pledges written to Postgres, newest first. Names are shown as the lead passenger entered them; phone numbers are never displayed."
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={22} />}
          title="No holds posted yet"
          body="Be the first traveller to reserve seats on an open corridor. No card is charged until Tier I confirms."
          action={
            <a
              href="#board"
              className="inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-5 text-[13px] font-medium text-on-accent transition-colors duration-200 hover:bg-accent-bright"
            >
              Browse open corridors <IconArrow size={13} />
            </a>
          }
        />
      ) : (
        <ul className="grid list-none gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((pledge, i) => {
            const corridor = corridorFor(pledge.corridor_id);
            return (
              <Reveal key={pledge.id} as="li" delay={Math.min(i, 5) * 40}>
                <div className="card-lift flex h-full flex-col gap-2.5 rounded-card border border-rule bg-surface px-4 py-3.5 shadow-panel">
                  <div className="flex items-start justify-between gap-2">
                    <span className="micro text-ink-faint">{pledge.booking_ref}</span>
                    <Chip tone={pledge.status === 'allotment_confirmed' ? 'jade' : 'marigold'}>
                      {pledge.status === 'allotment_confirmed' ? 'confirmed' : 'escrow'}
                    </Chip>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="tnum text-[17px] font-medium text-ink">{pledge.seats}</span>
                    <span className="text-[12px] text-ink-muted">
                      seat{pledge.seats === 1 ? '' : 's'} ·{' '}
                      {corridor ? corridor.code : 'corridor removed'}
                    </span>
                  </div>
                  <p className="truncate text-[12px] text-ink-soft">{pledge.passenger_name}</p>
                  <p className="truncate text-[11px] text-ink-faint">{pledge.passenger_cohort}</p>
                  <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-rule-soft pt-2.5">
                    <span className="tnum text-[12.5px] text-accent-deep">
                      {rupees(pledge.locked_unit_fare)}
                      <span className="text-ink-faint"> /seat net</span>
                    </span>
                    <span className="tnum micro text-ink-faint">
                      {formatDate(pledge.created_at)}
                    </span>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[11.5px] text-ink-faint">
        Ledger read at <ClockStamp className="text-ink-muted" /> IST · pledges are device-scoped for
        this prototype, so your own holds appear under <em className="not-italic text-ink-soft">My trips</em>.
      </p>
    </Section>
  );
}
