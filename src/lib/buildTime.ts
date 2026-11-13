/**
 * The instant this page's HTML was rendered.
 *
 * A prerendered page is written once at build time and served to everyone, so
 * anything derived from "now" has to start from the same value in the server
 * render and in the browser's first render — otherwise hydration disagrees with
 * the markup it is supposed to be adopting. The prerender step injects both of
 * these into the HTML; a client-only load (an unknown path served the SPA
 * fallback, or a dev server) falls back to the moment the module was evaluated.
 *
 * `useClock` re-anchors to the real clock in a layout effect, before the browser
 * paints, so a stale countdown is never visible — only never mismatched.
 */
interface PrerenderGlobals {
  __UTSAVAIR_PRERENDERED_AT__?: number;
  __UTSAVAIR_ROUTE__?: string;
}

declare global {
  interface Window extends PrerenderGlobals {}
}

function read<K extends keyof PrerenderGlobals>(key: K): PrerenderGlobals[K] | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & PrerenderGlobals)[key];
}

/** Build-time instant, or the moment this module loaded on a client-only render. */
const injected = read('__UTSAVAIR_PRERENDERED_AT__');
export const PRERENDERED_AT: number =
  typeof injected === 'number' && Number.isFinite(injected) ? injected : Date.now();

/**
 * The path this HTML was rendered for, or null when the page was not
 * prerendered. `main.tsx` compares it against `location.pathname`: hydrate when
 * they agree, client-render when they do not, because adopting markup for a
 * different route would produce a mismatch React has to recover from.
 */
const route = read('__UTSAVAIR_ROUTE__');
export const PRERENDERED_ROUTE: string | null = typeof route === 'string' ? route : null;
