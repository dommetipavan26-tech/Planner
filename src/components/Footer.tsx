import { LINEAR_PROJECT } from '../data/roadmap';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink bg-ink text-paper">
      <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 py-9 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-paper text-ink">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M3 17.5 21 5l-4.2 13.2-3.1-4.4-4.6 3.4 1.1-5.6z" fill="currentColor" />
              </svg>
            </span>
            <span className="font-mono text-[13px] font-bold tracking-[0.22em]">UTSAVAIR</span>
          </div>
          <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-ink-300">
            A festival bulk corridor desk. We pool travelers on the routes that surge hardest, clear
            them against airline group desks and chartered coach fleets, and publish the fee we keep
            on every receipt.
          </p>
          <p className="mt-4 max-w-md border-l-2 border-marigold-bright/60 pl-3 text-[11.5px] leading-relaxed text-ink-400">
            Working prototype. Corridor contracts, fares, cohorts and bids on this board are seeded
            demonstration data written to a live Supabase project — no inventory is being sold and no
            payment is captured. Group fares, EMD terms and manifest deadlines shown here illustrate
            how real IATA group contracts behave; they are not signed agreements.
          </p>
        </div>

        <div>
          <p className="micro text-ink-400">ledger</p>
          <ul className="mt-3 space-y-1.5 text-[12px] text-ink-300">
            <li className="font-mono">utsav_corridors</li>
            <li className="font-mono">utsav_pledges</li>
            <li className="font-mono">utsav_carrier_bids</li>
            <li className="font-mono">utsav_corridor_requests</li>
            <li className="font-mono text-marigold-bright">utsav_join_cohort()</li>
            <li className="font-mono text-marigold-bright">utsav_upvote_request()</li>
          </ul>
        </div>

        <div>
          <p className="micro text-ink-400">delivery</p>
          <ul className="mt-3 space-y-2 text-[12px]">
            <FooterLink href="https://github.com/dommetipavan26-tech/experiment1">
              GitHub · experiment1
            </FooterLink>
            <FooterLink href={LINEAR_PROJECT.url}>Linear · {LINEAR_PROJECT.name}</FooterLink>
            <FooterLink href="https://supabase.com/dashboard/project/txbgovhxqxvlioszevbe">
              Supabase · txbgovhxqxvlioszevbe
            </FooterLink>
            <FooterLink href="https://vercel.com/pavan-4ae5/utsav-corridor">
              Vercel · utsav-corridor
            </FooterLink>
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
            React 19 · TypeScript · Vite · Tailwind v4 · Supabase Postgres + Realtime · Vercel ·
            Linear
          </p>
        </div>
      </div>

      <div className="border-t border-ink-700">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="font-mono text-[10.5px] tracking-[0.06em] text-ink-400 uppercase">
            UtsavAir corridor desk · Amaravati / Vijayawada
          </p>
          <p className="font-mono text-[10.5px] text-ink-400">
            fares in ₹ incl. platform fee · all times IST
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-ink-300 transition-colors hover:text-paper"
      >
        {children}
        <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
          <path d="M2 8L8 2M4 2h4v4" stroke="currentColor" fill="none" strokeWidth="1.3" />
        </svg>
      </a>
    </li>
  );
}
