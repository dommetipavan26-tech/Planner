import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouter } from '../lib/router';
import { PRERENDERED_AT } from '../lib/buildTime';
import { useNow } from '../hooks/useClock';
import { formatClockMs } from '../lib/format';
import type { LedgerEvent } from '../hooks/useLedger';
import type { LedgerStatus } from '../lib/types';
import { Chip, cn } from './ui';
import { IconRefresh, IconTicket } from './icons';

const NAV = [
  { href: '/', label: 'Corridors' },
  { href: '/trips', label: 'My trips' },
  { href: '/carriers', label: 'Carriers' },
  { href: '/requests', label: 'Requests' },
] as const;

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="11" className="stroke-line-bright" strokeWidth="1" fill="none" />
        <path
          d="M4.6 15.4c3.1-5.6 8-8.6 14.2-9.1"
          className="stroke-marigold"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="18.6" cy="6.4" r="1.9" className="fill-marigold" />
        <circle cx="5.4" cy="15" r="1.3" className="fill-mist" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="micro-md text-[12px] tracking-[0.22em] text-ivory">UTSAVAIR</span>
        {compact ? null : (
          <span className="mt-1 text-[10px] leading-none text-mist-faint">festival corridor desk</span>
        )}
      </span>
    </span>
  );
}

function StatusPill({
  status,
  onReload,
}: {
  status: LedgerStatus;
  onReload: () => void;
}) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status !== 'connecting') setBusy(false);
  }, [status]);

  const label = status === 'ready' ? 'Live ledger' : status === 'connecting' ? 'Connecting' : 'Snapshot';
  const tone = status === 'ready' ? 'jade' : status === 'connecting' ? 'marigold' : 'clay';
  const detail =
    status === 'ready'
      ? `synced ${formatClockMs(now)} IST`
      : status === 'connecting'
        ? 'reading Postgres'
        : 'showing bundled mirror';

  return (
    <div className="flex items-center gap-2">
      <span className="hidden flex-col items-end leading-tight lg:flex">
        <span className="micro text-mist-faint">{detail}</span>
      </span>
      <Chip tone={tone} dot={status === 'ready'}>
        {label}
      </Chip>
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          onReload();
        }}
        disabled={busy || status === 'connecting'}
        aria-label="Reload ledger from Postgres"
        title="Reload ledger"
        className="grid h-7 w-7 place-items-center rounded-pill border border-line text-mist-dim transition-colors duration-200 hover:border-line-bright hover:text-ivory disabled:opacity-40"
      >
        <IconRefresh size={13} className={cn(busy && 'animate-spin')} />
      </button>
    </div>
  );
}

function EventTicker({ events }: { events: LedgerEvent[] }) {
  const latest = events[0];
  if (!latest) return null;
  const toneClass =
    latest.tone === 'tier'
      ? 'text-marigold'
      : latest.tone === 'pledge'
        ? 'text-jade'
        : latest.tone === 'supply'
          ? 'text-lagoon'
          : 'text-mist-dim';
  return (
    <div className="overflow-hidden border-b border-line-soft bg-night-900/70">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2.5 px-4 py-1.5 sm:px-6">
        <span className="micro shrink-0 text-mist-faint">ledger</span>
        <p
          key={latest.id}
          className={cn('animate-fade truncate text-[11.5px]', toneClass)}
          aria-live="polite"
        >
          {latest.text}
        </p>
        <span className="tnum micro ml-auto hidden shrink-0 text-mist-faint sm:inline">
          {formatClockMs(latest.at)}
        </span>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  status,
  events,
  onReload,
  tripCount,
  watchCount,
}: {
  children: ReactNode;
  status: LedgerStatus;
  events: LedgerEvent[];
  onReload: () => void;
  tripCount: number;
  watchCount: number;
}) {
  const { route, path } = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) =>
    href === '/' ? route.name === 'corridors' || route.name === 'corridor' : path.startsWith(href);

  return (
    <div className="grain flex min-h-dvh flex-col bg-night">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-90 focus:rounded-pill focus:bg-marigold focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-night-900"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-60 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
          scrolled
            ? 'border-line bg-night/85 backdrop-blur-xl'
            : 'border-transparent bg-night/60 backdrop-blur-md',
        )}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link to="/" aria-label="UtsavAir home" className="shrink-0">
            <Wordmark />
          </Link>

          <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'relative rounded-pill px-3 py-1.5 text-[13px] transition-colors duration-200',
                  isActive(item.href) ? 'text-ivory' : 'text-mist-dim hover:text-mist',
                )}
              >
                {item.label}
                {item.href === '/trips' && tripCount > 0 ? (
                  <span className="tnum ml-1.5 rounded-pill bg-night-800 px-1.5 py-0.5 text-[10px] text-marigold">
                    {tripCount}
                  </span>
                ) : null}
                {isActive(item.href) ? (
                  <span
                    className="absolute inset-x-3 -bottom-[9px] h-px bg-marigold"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link
              to="/trips"
              className="hidden items-center gap-1.5 rounded-pill border border-line px-2.5 py-1.5 text-[12px] text-mist-dim transition-colors duration-200 hover:border-line-bright hover:text-ivory sm:inline-flex"
              title="Watched corridors and your pledges"
            >
              <IconTicket size={13} />
              <span className="tnum">{watchCount}</span>
              <span className="micro text-mist-faint">watched</span>
            </Link>
            <StatusPill status={status} onReload={onReload} />
          </div>
        </div>

        {/* Mobile nav: a scrollable rail rather than a hidden hamburger */}
        <nav
          aria-label="Primary mobile"
          className="flex gap-1 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-pill border px-3 py-1.5 text-[12.5px] transition-colors duration-200',
                isActive(item.href)
                  ? 'border-marigold/50 bg-marigold-veil text-marigold'
                  : 'border-line text-mist-dim',
              )}
            >
              {item.label}
              {item.href === '/trips' && tripCount > 0 ? (
                <span className="tnum ml-1.5 text-mist-faint">{tripCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </header>

      <EventTicker events={events} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  // Derived from the build instant rather than the viewer's clock, so a
  // prerendered footer hydrates to the year it was written in.
  const year = new Date(PRERENDERED_AT).getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-night-900/50">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Wordmark compact />
          <p className="max-w-xs text-[12px] leading-relaxed text-mist-dim">
            Pooled group allotment for festival travel out of Andhra Pradesh. Carriers contract a
            block, travellers pledge into it, the slab price applies to everyone the moment the
            threshold clears.
          </p>
          <p className="max-w-xs text-[11.5px] leading-relaxed text-mist-faint">
            No payment is processed on this prototype. Fares shown are contractual group rates; the
            platform fee is disclosed on every figure.
          </p>
        </div>

        <FooterCol
          title="Desk"
          links={[
            { href: '/', label: 'Live corridors' },
            { href: '/trips', label: 'My trips & watches' },
            { href: '/carriers', label: 'Carrier bids' },
            { href: '/requests', label: 'Corridor requests' },
          ]}
        />
        <FooterCol
          title="How it works"
          links={[
            { href: '/#how', label: 'Pledge mechanics' },
            { href: '/#tiers', label: 'Tier slabs' },
            { href: '/#fee', label: 'Fee disclosure' },
            { href: '/#refund', label: 'Refund rule' },
          ]}
        />
        <div className="flex flex-col gap-2">
          <span className="micro text-mist-faint">Infrastructure</span>
          <ul className="flex flex-col gap-1.5 text-[12px] text-mist-dim">
            <li>Supabase Postgres · realtime ledger</li>
            <li>Vite 7 · React 19 · Tailwind 4</li>
            <li>Deployed on Vercel</li>
            <li className="tnum text-mist-faint">project txbgovhxqxvlioszevbe</li>
          </ul>
        </div>
      </div>

      <div className="hairline-t">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-4 text-[11px] text-mist-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {year} UtsavAir corridor desk. Prototype — not a licensed ticketing agent.</p>
          <p className="tnum">All times IST · fares per seat · fees inclusive where stated</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="micro text-mist-faint">{title}</span>
      <ul className="flex flex-col gap-1.5">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              to={link.href}
              className="text-[12.5px] text-mist-dim transition-colors duration-200 hover:text-ivory"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
