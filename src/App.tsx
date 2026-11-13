import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';

import { useRouter, ScrollToTop } from './lib/router';
import { routeTitle } from './lib/meta';
import { useLedger } from './hooks/useLedger';
import type { Corridor } from './lib/types';
import { AppShell } from './components/AppShell';
import { JoinSheet } from './components/JoinSheet';
import { Button, useToasts, ToastStack } from './components/ui';
import { CorridorsView } from './views/CorridorsView';
import { IconAlert, IconClose } from './components/icons';
import { RouteFallback } from './components/RouteFallback';

/* The landing route stays in the main chunk: first paint must never wait on a
   second request. Everything else is a route a traveller chooses to visit, so
   its code arrives when they ask for it and not before. */
const CorridorView = lazy(() =>
  import('./views/CorridorView').then((m) => ({ default: m.CorridorView })),
);
const TripsView = lazy(() => import('./views/TripsView').then((m) => ({ default: m.TripsView })));
const CarriersView = lazy(() =>
  import('./views/CarriersView').then((m) => ({ default: m.CarriersView })),
);
const RequestsView = lazy(() =>
  import('./views/RequestsView').then((m) => ({ default: m.RequestsView })),
);
const NotFoundView = lazy(() =>
  import('./views/NotFoundView').then((m) => ({ default: m.NotFoundView })),
);

/* Real-user metrics, deliberately behind the same lazy boundary. Both packages
   are thin: they open a queue and inject Vercel's collector from an effect, and
   that collector reads buffered PerformanceObserver entries, so waiting one
   chunk before mounting costs no data and keeps the instruments off the critical
   path entirely. */
const Analytics = lazy(() =>
  import('@vercel/analytics/react').then((m) => ({ default: m.Analytics })),
);
const SpeedInsights = lazy(() =>
  import('@vercel/speed-insights/react').then((m) => ({ default: m.SpeedInsights })),
);

/* The five routed views, injected so the same tree can render twice: in the
   browser behind `lazy()` chunks, and at build time from `AppStatic` with the
   modules already in hand. A prerender that suspends is a prerender that emits
   streaming completion scripts into a static file, so the static tree must not
   contain a single boundary. */
export interface RoutedViews {
  /* ComponentType, not the bare function type: the browser hands these in as
     `lazy()` wrappers and the build hands them in as the modules themselves,
     and both must satisfy the same prop contract. */
  CorridorView: ComponentType<Parameters<typeof import('./views/CorridorView').CorridorView>[0]>;
  TripsView: ComponentType<Parameters<typeof import('./views/TripsView').TripsView>[0]>;
  CarriersView: ComponentType<Parameters<typeof import('./views/CarriersView').CarriersView>[0]>;
  RequestsView: ComponentType<Parameters<typeof import('./views/RequestsView').RequestsView>[0]>;
  NotFoundView: ComponentType<Parameters<typeof import('./views/NotFoundView').NotFoundView>[0]>;
}

export function AppTree({ views }: { views: RoutedViews }) {
  const { CorridorView, TripsView, CarriersView, RequestsView, NotFoundView } = views;
  const ledger = useLedger();
  const { route } = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const [holdCode, setHoldCode] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Keep the sheet bound to a code, not an object: realtime updates to that
  // corridor then flow straight into the open dialog.
  const holdCorridor = useMemo(
    () => (holdCode ? ledger.corridors.find((c) => c.code === holdCode) ?? null : null),
    [holdCode, ledger.corridors],
  );

  useEffect(() => {
    if (route.name === 'corridor') return; // the corridor view owns its own title
    document.title = routeTitle(route);
  }, [route]);

  const handleHold = useCallback((corridor: Corridor) => {
    setHoldCode(corridor.code);
  }, []);

  const handleWatch = useCallback(
    async (corridor: Corridor) => {
      const result = await ledger.toggleWatch(corridor);
      if (!result.ok) {
        push(result.error ?? `Could not update the watch on ${corridor.code}.`, 'error');
        return;
      }
      push(
        result.data
          ? `Watching ${corridor.code} — tier moves will surface in the ledger ticker`
          : `Stopped watching ${corridor.code}`,
        result.simulated ? 'info' : 'success',
      );
    },
    [ledger, push],
  );

  const showSnapshotBanner = ledger.status === 'offline' && !bannerDismissed;

  return (
    <>
      <ScrollToTop />
      <AppShell
        status={ledger.status}
        events={ledger.events}
        onReload={() => void ledger.reload()}
        tripCount={ledger.mine.length}
        watchCount={ledger.watches.length}
      >
        {showSnapshotBanner ? (
          <div
            role="status"
            className="border-b border-clay-line bg-clay-veil/95 backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
              <IconAlert size={14} className="shrink-0 text-clay" />
              <p className="flex-1 text-[12px] leading-snug text-clay">
                Postgres is unreachable from this browser, so the desk is serving its bundled mirror of
                the ledger. Figures are correct as of the last build; pledges and watches you make now
                are stored on this device only.
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="quiet" onClick={() => void ledger.reload()}>
                  Retry connection
                </Button>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  aria-label="Dismiss snapshot notice"
                  className="grid h-7 w-7 place-items-center rounded-pill text-clay transition-colors duration-200 hover:bg-clay-veil-bright"
                >
                  <IconClose size={13} />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {route.name === 'corridors' ? (
          <CorridorsView ledger={ledger} onHold={handleHold} onWatch={(c) => void handleWatch(c)} />
        ) : null}

        <Suspense fallback={<RouteFallback route={route.name} />}>
          {route.name === 'corridor' && route.code ? (
            <CorridorView
              code={route.code}
              ledger={ledger}
              allCorridors={ledger.corridors}
              onHold={handleHold}
              onWatch={(c) => void handleWatch(c)}
            />
          ) : null}

          {route.name === 'trips' ? (
            <TripsView ledger={ledger} onWatch={(c) => void handleWatch(c)} onToast={push} />
          ) : null}

          {route.name === 'carriers' ? <CarriersView ledger={ledger} onToast={push} /> : null}

          {route.name === 'requests' ? (
            <RequestsView ledger={ledger} onToast={push} onHold={handleHold} />
          ) : null}

          {route.name === 'notfound' ? <NotFoundView corridors={ledger.corridors} /> : null}
        </Suspense>
      </AppShell>

      <JoinSheet
        corridor={holdCorridor}
        open={holdCorridor !== null}
        onClose={() => setHoldCode(null)}
        onJoin={ledger.join}
        onToast={push}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <Suspense fallback={null}>
        <Analytics />
        <SpeedInsights />
      </Suspense>
    </>
  );
}

export default function App() {
  return <AppTree views={{ CorridorView, TripsView, CarriersView, RequestsView, NotFoundView }} />;
}
