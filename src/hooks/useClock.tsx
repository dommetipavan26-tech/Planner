import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

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
  const [now, setNow] = useState(() => Date.now());
  const [coarse, setCoarse] = useState(() => Date.now());

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

/** 1 Hz. Use inside small leaves only — every consumer re-renders each tick. */
export function useNow(): number {
  const value = useContext(FineClock);
  return value === 0 ? Date.now() : value;
}

/** 30 s. For statuses and relative timestamps on larger components. */
export function useCoarseNow(): number {
  const value = useContext(CoarseClock);
  return value === 0 ? Date.now() : value;
}
