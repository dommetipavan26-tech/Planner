import type { Corridor } from '../lib/types';
import { compactRupees, number, pct } from '../lib/format';
import type { ViewId } from './Header';
import { BoardHighlights, LiveBoard } from './LiveBoard';
import { Button } from './ui';

interface Totals {
  seatsPledged: number;
  seatsAllotted: number;
  savings: number;
  fees: number;
  locked: number;
  corridors: number;
}

export function Hero({
  corridors,
  totals,
  live,
  onOpen,
  onView,
  onJumpToBoard,
}: {
  corridors: Corridor[];
  totals: Totals;
  live: boolean;
  onOpen: (c: Corridor) => void;
  onView: (v: ViewId) => void;
  onJumpToBoard: () => void;
}) {
  const avgSaving =
    totals.seatsPledged > 0 ? Math.round(totals.savings / totals.seatsPledged) : 0;
  const avgFee =
    totals.seatsPledged > 0 ? Math.round(totals.fees / totals.seatsPledged) : 0;
  const fillRate = totals.seatsAllotted ? (totals.seatsPledged / totals.seatsAllotted) * 100 : 0;

  return (
    <div className="border-b border-hairline">
      <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 py-9 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:py-12">
        <div className="lg:col-span-6 xl:col-span-5">
          <p className="micro flex flex-wrap items-center gap-x-2 gap-y-1 text-marigold">
            <span>sankranti 2027 · ugadi 2027</span>
            <span className="text-ink-300">/</span>
            <span className="text-ink-400">
              {totals.corridors} contracted corridors · {totals.seatsAllotted} seats under block
            </span>
          </p>

          <h1 className="font-display mt-4 text-[34px] leading-[1.06] font-medium tracking-[-0.02em] text-ink sm:text-[44px] lg:text-[48px]">
            Forty-five people,
            <br />
            one contract,
            <br />
            <span className="text-marigold">one fare.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[14.5px] leading-[1.65] text-ink-500">
            Festival pricing is not a shortage. It is a retail bucket that individual buyers cannot
            escape. UtsavAir pools travelers on the corridors that surge hardest — Vijayawada,
            Visakhapatnam and Tirupati to Delhi; Hyderabad and Bengaluru home to Amaravati — and
            clears them against airline group desks and chartered coach fleets at contracted net
            fares. You join a cohort, the cohort unlocks the slab, and the fee we keep is printed on
            your receipt.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Button variant="accent" onClick={onJumpToBoard}>
              Join a corridor cohort
            </Button>
            <Button variant="outline" onClick={() => onView('review')}>
              Read the founder review
            </Button>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-hairline pt-6 sm:grid-cols-4">
            <Metric
              label="seats pledged"
              value={number(totals.seatsPledged)}
              sub={`${pct(fillRate)} of contracted block`}
            />
            <Metric
              label="traveler savings held"
              value={compactRupees(totals.savings)}
              sub={`≈ ${compactRupees(avgSaving)} per seat`}
            />
            <Metric
              label="platform fee"
              value={compactRupees(totals.fees)}
              sub={`≈ ${compactRupees(avgFee)} per seat, disclosed`}
            />
            <Metric
              label="cohorts tier-locked"
              value={`${totals.locked}/${totals.corridors}`}
              sub="minimum viable cohort crossed"
            />
          </dl>

          <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-400">
            <span>Pledges escrow-held, never on our balance sheet</span>
            <span className="hidden h-3 w-px bg-hairline sm:block" />
            <span>Full refund if a corridor misses its lock deadline</span>
            <span className="hidden h-3 w-px bg-hairline sm:block" />
            <span>Named manifest at T-72h</span>
          </p>
        </div>

        <div className="lg:col-span-6 xl:col-span-7">
          <LiveBoard corridors={corridors} live={live} onOpen={onOpen} />
          <div className="mt-4">
            <BoardHighlights corridors={corridors} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="micro text-ink-400">{label}</dt>
      <dd className="tnum font-display mt-1.5 text-[24px] leading-none font-medium text-ink">
        {value}
      </dd>
      <dd className="mt-1.5 text-[11px] leading-snug text-ink-400">{sub}</dd>
    </div>
  );
}
