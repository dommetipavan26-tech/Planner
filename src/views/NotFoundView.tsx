import { useEffect } from 'react';
import { Link, corridorPath } from '../lib/router';
import type { Corridor } from '../lib/types';
import { formatDate, rupees, landedPerSeat } from '../lib/format';
import { EmptyState } from '../components/ui';
import { IconArrow } from '../components/icons';

export function NotFoundView({ corridors }: { corridors: Corridor[] }) {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Page not found · UtsavAir';
    return () => {
      document.title = previous;
    };
  }, []);

  const suggestions = corridors.slice(0, 4);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-20 sm:px-6">
      <EmptyState
        as="h1"
        icon={<IconArrow size={22} />}
        title="That route does not exist"
        body="No page is served at this address. The corridor board is the front door — every open block, its tier slabs and its lock countdown are on it."
        action={
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-marigold px-5 text-[13px] font-medium text-night-900 transition-colors duration-200 hover:bg-marigold-bright"
          >
            Back to the board <IconArrow size={13} />
          </Link>
        }
      />

      {suggestions.length > 0 ? (
        <div className="rounded-card border border-line bg-night-900 p-4">
          <span className="micro text-mist-faint">Open corridors</span>
          <ul className="mt-3 grid list-none gap-2 sm:grid-cols-2">
            {suggestions.map((c) => (
              <li key={c.id}>
                <Link
                  to={corridorPath(c.code)}
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-night-850 px-3 py-2 transition-colors duration-200 hover:border-marigold/50"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="micro text-ivory">{c.code}</span>
                    <span className="truncate text-[11px] text-mist-faint">
                      {formatDate(c.departure_date)} · {c.origin_code}→{c.dest_code}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[12.5px] text-marigold">
                    {rupees(landedPerSeat(c))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
