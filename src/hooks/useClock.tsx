import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { PRERENDERED_AT } from '../lib/buildTime';
import { useIsoLayoutEffect } from '../lib/useIsoLayoutEffect';

/**
 * Two shared clocks, one provider.
 *
 * A 1 Hz tick is right for a countdown in its last hour and wrong for a grid of
 * corridor cards, where it would re-render everything on screen every second.
 * So the fine clock is consumed only by small leaf components (<Countdown />,
 * <ClockStamp />) and the coarse clock — 30 s — drives status that only changes
 * meaningfully by the minute (lock closed, block full, "3 min ago").
 */
const FineClock = createContext<number>(0);
const CoarseClock = createContext<number>(0);

const COARSE_MS = 30_000;

export function ClockProvider({ children }: { children: ReactNode }) {
  // Both clocks start at the instant this HTML was rendered. For a prerendered
  // page that is the build time, injected into the document, so the server
  // render and the browser's first render produce identical markup and hydration
  // has nothing to disagree about.
  const [now, setNow] = useState(() => PRERENDERED_AT);
  const [coarse, setCoarse] = useState(() => PRERENDERED_AT);

  // Correct to the real clock before the browser paints, so a countdown built
  // hours ago is never visible — it is only ever mismatch-free.
  useIsoLayoutEffect(() => {
    const t = Date.now();
    setNow(t);
    setCoarse(t);
  }, []);

  useEffect(() => {
    // Re-anchor on resume so a backgrounded tab never shows a stale countdown.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const t = Date.now();
      setNow(t);
      setCoarse(t);
    };

    document.addEventListener('visibilitychange', onVisible);
    const fine = window.setInterval(() => setNow(Date.now()), 1000);
    const coarseId = window.setInterval(() => setCoarse(Date.now()), COARSE_MS);
    return () => {
      window.clearInterval(fine);
      window.clearInterval(coarseId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <FineClock.Provider value={now}>
      <CoarseClock.Provider value={coarse}>{children}</CoarseClock.Provider>
    </FineClock.Provider>
  );
}

/* The `0` sentinel means no ClockProvider is mounted. Falling back to
   PRERENDERED_AT rather than Date.now() keeps these hooks safe to call during a
   server render — a prerender that called Date.now() would produce markup the
   browser could never match. The cost is that the fallback is a frozen instant:
   a countdown read outside the provider does not tick. Mount the provider. */

/** 1 Hz. Use inside small leaves only — every consumer re-renders each tick. */
export function useNow(): number {
  const value = useContext(FineClock);
  return value === 0 ? PRERENDERED_AT : value;
}

/** 30 s. For statuses and relative timestamps on larger components. */
export function useCoarseNow(): number {
  const value = useContext(CoarseClock);
  return value === 0 ? PRERENDERED_AT : value;
}
