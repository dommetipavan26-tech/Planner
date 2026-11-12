import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

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

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

// The boot loader in index.html is only scaffolding for first paint; React owns
// the container from here.
container.innerHTML = '';

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ClockProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </ClockProvider>
    </ErrorBoundary>
  </StrictMode>,
);
