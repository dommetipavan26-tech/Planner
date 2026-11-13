import { AppTree, type RoutedViews } from './App';
import { CorridorView } from './views/CorridorView';
import { TripsView } from './views/TripsView';
import { CarriersView } from './views/CarriersView';
import { RequestsView } from './views/RequestsView';
import { NotFoundView } from './views/NotFoundView';

/**
 * The app as the prerender renders it: identical tree, eager views.
 *
 * This module is imported by `scripts/prerender.tsx` and by nothing else, so the
 * eager imports never reach the browser bundle — route splitting stays exactly
 * as `App` defines it. What it buys is a render with no Suspense boundary at
 * all: a boundary that suspends, even briefly, makes the renderer flush the
 * shell first and write the completed view as a hidden div plus a `$RC` swap
 * script, which is the right shape for a socket and the wrong shape for a file
 * on disk. `Analytics` and `SpeedInsights` are absent here because on the server
 * they render nothing; the document is byte-identical without them.
 */
const views: RoutedViews = { CorridorView, TripsView, CarriersView, RequestsView, NotFoundView };

export default function AppStatic() {
  return <AppTree views={views} />;
}
