import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCorridorDesk, type JoinPayload } from './hooks/useCorridorDesk';
import { Header, TickerStrip, type ViewId } from './components/Header';
import { Hero } from './components/Hero';
import { CorridorLedger } from './components/CorridorLedger';
import { CorridorSheet } from './components/CorridorSheet';
import { AllotmentDesk } from './components/AllotmentDesk';
import { DemandBoard } from './components/DemandBoard';
import { Review } from './components/Review';
import { Roadmap } from './components/Roadmap';
import { PledgeLedger } from './components/PledgeLedger';
import { SurgeSpread } from './components/SurgeChart';
import { Footer } from './components/Footer';
import { Button, Panel, PanelHead, ToastProvider, useToast } from './components/ui';

const VIEWS: ViewId[] = ['board', 'allotment', 'demand', 'review', 'ops'];

const PAGE_INTRO: Record<Exclude<ViewId, 'board'>, { eyebrow: string; title: string; lede: string }> = {
  allotment: {
    eyebrow: 'carrier side',
    title: 'The allotment desk',
    lede: 'Where supply is negotiated. Each bid is a contracted net fare, a seat commitment, an EMD term and a hold window — the four numbers that decide what a traveler actually pays.',
  },
  demand: {
    eyebrow: 'traveler side',
    title: 'The demand board',
    lede: 'Corridors open where a cohort already exists. Post a route, gather committed seats from your association, alumni wing or team, and the desk takes the ones that clear 15 to the carriers.',
  },
  review: {
    eyebrow: 'founder memo',
    title: 'An honest review of this idea',
    lede: 'A weighted score across eight dimensions, the risk register with mitigations, where the money must legally sit, and a live unit-economics model you can run against your own assumptions.',
  },
  ops: {
    eyebrow: 'delivery',
    title: 'How this product is built and tracked',
    lede: 'The live stack behind the board — Supabase ledger and realtime, Vercel delivery, GitHub source and the Linear project this roadmap is mirrored from.',
  },
};

function readHash(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (VIEWS as string[]).includes(raw) ? (raw as ViewId) : 'board';
}

function Desk() {
  const desk = useCorridorDesk();
  const toast = useToast();
  const [view, setView] = useState<ViewId>(() => readHash());
  const [activeId, setActiveId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: ViewId) => {
    setView(next);
    window.location.hash = `/${next}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const activeCorridor = useMemo(
    () => desk.corridors.find((c) => c.id === activeId) ?? null,
    [desk.corridors, activeId],
  );

  const live = desk.status === 'ready' && desk.source === 'live';

  const handleJoin = useCallback(
    async (payload: JoinPayload) => {
      const res = await desk.joinCohort(payload);
      if (res.ok && res.data) {
        toast.push({
          tone: 'ok',
          title: `${res.data.booking_ref} · ${res.data.seats} seat${res.data.seats === 1 ? '' : 's'} held`,
          body: res.simulated
            ? 'Snapshot ledger — Postgres unreachable, so nothing was committed.'
            : `Committed to Postgres and streamed to every open board. Saves ₹${res.data.estimated_saving.toLocaleString('en-IN')} against festival retail.`,
        });
      } else {
        toast.push({ tone: 'error', title: 'Pledge not recorded', body: res.error });
      }
      return res;
    },
    [desk, toast],
  );

  const jumpToBoard = useCallback(() => {
    if (view !== 'board') {
      go('board');
      window.setTimeout(() => {
        boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 260);
      return;
    }
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [go, view]);

  return (
    <div className="min-h-screen bg-paper">
      <Header
        view={view}
        onView={go}
        status={desk.status}
        source={desk.source}
        onRefresh={() => {
          void desk.refresh();
          toast.push({ tone: 'ok', title: 'Re-read the ledger from Postgres' });
        }}
      />
      <TickerStrip feed={desk.feed} totals={desk.totals} live={live} />

      {!live ? (
        <div className="border-b border-marigold/30 bg-marigold-soft">
          <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
            <p className="micro text-marigold">
              {desk.status === 'connecting' ? 'connecting to postgres' : 'snapshot mode'}
            </p>
            <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-600">
              {desk.status === 'connecting'
                ? 'Reading utsav_corridors, utsav_pledges, utsav_carrier_bids and utsav_corridor_requests…'
                : 'This browser cannot reach the Supabase project, so the board is showing a bundled snapshot of the ledger. Pledges and bids still work locally but are not committed.'}
            </p>
            {desk.status === 'offline' ? (
              <Button size="sm" variant="outline" onClick={() => void desk.refresh()}>
                Retry connection
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <main>
        {view === 'board' ? (
          <>
            <Hero
              corridors={desk.corridors}
              totals={desk.totals}
              live={live}
              onOpen={(c) => setActiveId(c.id)}
              onView={go}
              onJumpToBoard={jumpToBoard}
            />

            <div className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:px-6">
              <div className="border-t border-ink pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-2xl">
                    <p className="micro flex items-center gap-2 text-marigold">
                      <span className="tnum text-ink-400">01</span> live corridor ledger
                    </p>
                    <h2 className="font-display mt-2 text-[26px] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[32px]">
                      Every block on the desk, with the fare it unlocks
                    </h2>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
                      Sort by saving, fill or surge exposure. Each row carries the contracted tier
                      ladder, the seats still open and the deadline after which every pledge in that
                      corridor is released.
                    </p>
                  </div>
                  <p className="tnum shrink-0 font-mono text-[11px] text-ink-400">
                    {desk.corridors.length} corridors · {desk.totals.seatsAllotted} seats ·{' '}
                    {desk.totals.seatsPledged} pledged
                  </p>
                </div>

                <div className="mt-6">
                  <CorridorLedger
                    corridors={desk.corridors}
                    onOpen={(c) => setActiveId(c.id)}
                    searchRef={(el) => {
                      boardRef.current = el;
                    }}
                  />
                </div>
              </div>

              <div className="mt-12 grid gap-6 border-t border-ink pt-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <p className="micro flex items-center gap-2 text-marigold">
                    <span className="tnum text-ink-400">02</span> surge exposure
                  </p>
                  <h2 className="font-display mt-2 text-[24px] leading-tight font-medium tracking-[-0.015em] text-ink sm:text-[28px]">
                    What the festival window does to a fare
                  </h2>
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-500">
                    The pale bar is what an OTA charges during the festival. The solid bar is what this
                    desk lands at, fee included. The tick marks the off-season baseline, so you can see
                    how much of the surge is real scarcity and how much is bucket pricing.
                  </p>
                  <div className="mt-5">
                    <Panel>
                      <PanelHead
                        eyebrow="all corridors"
                        title="Retail surge vs contracted landed fare"
                      />
                      <div className="p-4 sm:p-5">
                        <SurgeSpread corridors={desk.corridors} />
                      </div>
                    </Panel>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <p className="micro flex items-center gap-2 text-marigold">
                    <span className="tnum text-ink-400">03</span> live receipts
                  </p>
                  <h2 className="font-display mt-2 text-[24px] leading-tight font-medium tracking-[-0.015em] text-ink sm:text-[28px]">
                    Who is in which cohort
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                    Pledges stream in over Supabase Realtime. Hold a seat and it appears here, on every
                    open board, without a refresh.
                  </p>
                  <div className="mt-5">
                    <PledgeLedger
                      pledges={desk.pledges}
                      corridors={desk.corridors}
                      source={desk.source}
                      onOpen={(c) => setActiveId(c.id)}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-12 border-t border-ink pt-6">
                <p className="micro flex items-center gap-2 text-marigold">
                  <span className="tnum text-ink-400">04</span> operating model
                </p>
                <h2 className="font-display mt-2 max-w-3xl text-[26px] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[32px]">
                  How a cohort becomes a ticket
                </h2>
                <ol className="mt-6 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      n: '01',
                      t: 'Pledge, do not pay',
                      d: 'Join a corridor with a soft hold. Nothing is captured until the cohort crosses Tier I, and the fee is printed before you confirm.',
                    },
                    {
                      n: '02',
                      t: 'The cohort unlocks the slab',
                      d: 'At 15, 30 and 45 seats the contracted net fare steps down for everyone already in the pool — not just the people who joined last.',
                    },
                    {
                      n: '03',
                      t: 'The block is confirmed',
                      d: 'The carrier group desk confirms against the contract reference and posts the EMD. Below Tier I at the deadline, every pledge releases in full.',
                    },
                    {
                      n: '04',
                      t: 'Manifest, then ticket',
                      d: 'Named passengers are submitted at T-72h, the group PNR is issued, and e-tickets reach each traveler with the boarding point and reporting time.',
                    },
                  ].map((s) => (
                    <li key={s.n} className="bg-paper-3 px-4 py-4">
                      <p className="tnum font-mono text-[11px] text-marigold">{s.n}</p>
                      <p className="mt-1.5 text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                        {s.t}
                      </p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">{s.d}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        ) : (
          <div className="mx-auto w-full max-w-[1320px] px-4 py-9 sm:px-6">
            <div className="max-w-3xl border-t border-ink pt-6">
              <p className="micro text-marigold">{PAGE_INTRO[view].eyebrow}</p>
              <h1 className="font-display mt-2 text-[30px] leading-[1.1] font-medium tracking-[-0.02em] text-ink sm:text-[38px]">
                {PAGE_INTRO[view].title}
              </h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-500">
                {PAGE_INTRO[view].lede}
              </p>
            </div>

            <div className="mt-8">
              {view === 'allotment' ? (
                <AllotmentDesk
                  corridors={desk.corridors}
                  bids={desk.bids}
                  source={desk.source}
                  onSubmitBid={async (payload) => {
                    const res = await desk.submitBid(payload);
                    return res;
                  }}
                />
              ) : null}
              {view === 'demand' ? (
                <DemandBoard
                  requests={desk.requests}
                  source={desk.source}
                  onSubmitRequest={desk.submitRequest}
                  onUpvote={desk.upvoteRequest}
                />
              ) : null}
              {view === 'review' ? <Review /> : null}
              {view === 'ops' ? <Roadmap /> : null}
            </div>
          </div>
        )}
      </main>

      <Footer />

      <CorridorSheet
        corridor={activeCorridor}
        pledges={desk.pledges}
        bids={desk.bids}
        source={desk.source}
        onClose={() => setActiveId(null)}
        onJoin={handleJoin}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Desk />
    </ToastProvider>
  );
}
