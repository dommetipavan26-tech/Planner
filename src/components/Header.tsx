import type { DeskSource, DeskStatus } from '../lib/types';
import { StatusDot } from './ui';

export type ViewId = 'board' | 'allotment' | 'demand' | 'review' | 'ops';

const NAV: { id: ViewId; label: string; note: string }[] = [
  { id: 'board', label: 'Corridor board', note: 'Live cohorts' },
  { id: 'allotment', label: 'Allotment desk', note: 'Carrier bids' },
  { id: 'demand', label: 'Demand board', note: 'Route requests' },
  { id: 'review', label: 'Idea review', note: 'Founder memo' },
  { id: 'ops', label: 'Delivery', note: 'Linear + Vercel' },
];

export function Header({
  view,
  onView,
  status,
  source,
  onRefresh,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  status: DeskStatus;
  source: DeskSource;
  onRefresh: () => void;
}) {
  const live = status === 'ready' && source === 'live';
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-ink text-paper">
      <div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-4 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onView('board')}
          className="flex shrink-0 items-center gap-2.5 text-left"
          aria-label="UtsavAir home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-paper text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                d="M3 17.5 21 5l-4.2 13.2-3.1-4.4-4.6 3.4 1.1-5.6z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block font-mono text-[13px] font-bold tracking-[0.22em] text-paper">
              UTSAVAIR
            </span>
            <span className="mt-1 hidden text-[10px] tracking-[0.08em] text-ink-300 uppercase sm:block">
              Festival bulk corridor desk
            </span>
          </span>
        </button>

        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative h-14 px-3 text-[12.5px] font-medium transition-colors ${
                  active ? 'text-paper' : 'text-ink-300 hover:text-paper'
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-2 bottom-0 h-[2px] transition-colors ${
                    active ? 'bg-marigold-bright' : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-3">
          <button
            type="button"
            onClick={onRefresh}
            title="Re-read the Postgres ledger"
            className={`flex h-7 items-center gap-1.5 rounded-[3px] border px-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
              live
                ? 'border-verdant/50 bg-verdant/15 text-[#8fd6b0]'
                : status === 'connecting'
                  ? 'border-ink-600 bg-ink-800 text-ink-300'
                  : 'border-marigold/50 bg-marigold/15 text-[#f0b57a]'
            }`}
          >
            <StatusDot
              tone={live ? 'verdant' : status === 'connecting' ? 'neutral' : 'marigold'}
              pulse={status !== 'ready'}
            />
            {live ? 'live · postgres' : status === 'connecting' ? 'connecting' : 'snapshot'}
          </button>
        </div>
      </div>

      <div className="border-t border-ink-700 lg:hidden">
        <nav
          className="mx-auto flex w-full max-w-[1320px] gap-1 overflow-x-auto px-3 py-1.5"
          aria-label="Primary mobile"
        >
          {NAV.map((item) => {
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onView(item.id)}
                className={`shrink-0 rounded-[3px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  active ? 'bg-paper text-ink' : 'text-ink-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function TickerStrip({
  feed,
  totals,
  live,
}: {
  feed: { at: number; text: string }[];
  totals: {
    seatsPledged: number;
    savings: number;
    fees: number;
    locked: number;
    corridors: number;
  };
  live: boolean;
}) {
  const latest = feed[0]?.text;
  return (
    <div className="border-b border-hairline bg-paper-2">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 sm:px-6">
        <span className="micro flex items-center gap-1.5 text-ink-400">
          <StatusDot tone={live ? 'verdant' : 'marigold'} pulse={live} />
          {live ? 'ledger stream' : 'snapshot ledger'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-500">
          {latest ?? 'Waiting for the first realtime change on utsav_corridors…'}
        </span>
        <span className="tnum hidden font-mono text-[11px] text-ink-400 sm:inline">
          {totals.seatsPledged} seats pledged · {totals.locked}/{totals.corridors} cohorts tier-locked
        </span>
      </div>
    </div>
  );
}
