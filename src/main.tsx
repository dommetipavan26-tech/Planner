import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

// Type: Geist for UI, Geist Mono for money and codes, Instrument Serif for
// display. Each @font-face is unicode-ranged, so the browser only ever fetches
// the subsets this page actually renders.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';

import './index.css';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouterProvider } from './lib/router';
import { ClockProvider } from './hooks/useClock';
import { PRERENDERED_ROUTE } from './lib/buildTime';
import { installErrorTelemetry } from './lib/telemetry';

// Before the first render, so an error thrown while mounting is still caught.
installErrorTelemetry();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

const tree = (
  <StrictMode>
    <ErrorBoundary>
      <ClockProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </ClockProvider>
    </ErrorBoundary>
  </StrictMode>
);

/** Trailing slashes removed, the way `matchPath` reads a path. */
function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

const served = PRERENDERED_ROUTE === null ? null : normalise(PRERENDERED_ROUTE);
const here = normalise(window.location.pathname);

// Which path the boot took, and why, for the browser suite and for anyone
// staring at a repainted page: the hydration gate can say "replaced" without
// saying whether the document mismatched, the marker was missing, or React
// recovered from a mismatch of its own.
const w = window as unknown as { __UTSAVAIR_BOOT__?: string };

if (served === here && container.firstElementChild !== null) {
  w.__UTSAVAIR_BOOT__ = `hydrate:${served}`;
  // This document was rendered for this route, so its markup is the first paint
  // and React adopts it instead of repainting over it.
  hydrateRoot(container, tree);
} else {
  // Either the page was not prerendered, or the SPA fallback served another
  // route's HTML for this path — an unknown URL, for instance. Hydrating that
  // would ask React to adopt markup for a different page, so render fresh. The
  // boot loader in index.html is only scaffolding for that first paint.
  w.__UTSAVAIR_BOOT__ = `render:served=${served}:here=${here}`;
  container.innerHTML = '';
  createRoot(container).render(tree);
}
