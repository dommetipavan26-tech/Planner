import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, ScrollToTop, type RouteMatch } from './lib/router';
import { useLedger } from './hooks/useLedger';
import type { Corridor } from './lib/types';
import { AppShell } from './components/AppShell';
import { JoinSheet } from './components/JoinSheet';
import { Button, useToasts, ToastStack } from './components/ui';
import { CorridorsView } from './views/CorridorsView';
import { CorridorView } from './views/CorridorView';
import { TripsView } from './views/TripsView';
import { CarriersView } from './views/CarriersView';
import { RequestsView } from './views/RequestsView';
import { NotFoundView } from './views/NotFoundView';
import { IconAlert, IconClose } from './components/icons';

const TITLES: Record<RouteMatch['name'], string> = {
  corridors: 'UtsavAir — festival corridor desk',
  corridor: 'UtsavAir — festival corridor desk',
  trips: 'My trips · UtsavAir',
  carriers: 'Carrier desk · UtsavAir',
  requests: 'Corridor requests · UtsavAir',
  notfound: 'Page not found · UtsavAir',
};

export default function App() {
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
    document.title = TITLES[route.name] ?? TITLES.corridors;
  }, [route.name]);

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
            className="border-b border-[#3a2619] bg-clay-veil/95 backdrop-blur-md"
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
                  className="grid h-7 w-7 place-items-center rounded-pill text-clay transition-colors duration-200 hover:bg-[#33210f]"
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
      </AppShell>

      <JoinSheet
        corridor={holdCorridor}
        open={holdCorridor !== null}
        onClose={() => setHoldCode(null)}
        onJoin={ledger.join}
        onToast={push}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
