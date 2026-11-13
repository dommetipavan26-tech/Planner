import type { RouteMatch } from '../lib/router';
import { Skeleton, cn } from './ui';

/**
 * The shape a route occupies while its chunk arrives.
 *
 * Two rules. First, it is announced rather than merely shown: `aria-busy` on the
 * region and one live text node, because a skeleton that only exists visually
 * leaves a screen-reader user staring at a page that claims to have loaded.
 * Second, it approximates the real layout's block sizes, so the view replacing it
 * moves the page as little as possible.
 */

const LABELS: Record<RouteMatch['name'], string> = {
  corridors: 'the corridor board',
  corridor: 'this corridor',
  trips: 'your trips',
  carriers: 'the carrier desk',
  requests: 'corridor requests',
  notfound: 'this page',
};

const SHELL = 'mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6';

export function RouteFallback({ route, className }: { route: RouteMatch['name']; className?: string }) {
  return (
    <div className={cn(SHELL, className)} aria-busy="true">
      <p className="sr-only" role="status">
        Loading {LABELS[route]}
      </p>

      <div aria-hidden="true" className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-full max-w-lg" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>

        {route === 'corridor' ? (
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-28 w-full" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full max-w-3xl" />
          </div>
        )}
      </div>
    </div>
  );
}
