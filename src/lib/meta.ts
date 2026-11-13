import type { Corridor } from './types';
import type { RouteMatch } from './router';
import { formatDate, landedPerSeat, ratio, rupees, surgeMultiple } from './format';

/**
 * Route metadata, in one place.
 *
 * The title a prerendered page ships with has to be the title the client sets
 * after hydration, or the tab flickers a different string once the bundle lands.
 * Keeping both sides on these two functions is what makes that true by
 * construction instead of by memory — `App`, `CorridorView` and
 * `scripts/prerender.tsx` all read from here.
 */

export const SITE_ORIGIN = 'https://utsav-corridor.vercel.app';

const BOARD_TITLE = 'UtsavAir — festival corridor desk';

const DESCRIPTIONS: Record<RouteMatch['name'], string> = {
  corridors:
    'Contracted airline and coach blocks for Sankranti, Ugadi and wedding-peak travel out of Andhra Pradesh. Pledge into a cohort: cross a tier and every seat reprices down, fee disclosed on every figure.',
  corridor:
    'Pooled group allotment on this festival corridor: tier slabs, landed fare per seat, boarding points, refund rule and the carrier bid behind the block.',
  trips:
    'Your pledges and watched corridors, read back from the ledger by this device — boarding passes, fare locks, manifest deadlines and release rules in one place.',
  carriers:
    'Every group-fare bid logged against a festival corridor: offered seats, net fare, hold window and status. Nothing here is binding until a contract reference is issued.',
  requests:
    'Request a corridor and upvote one. A request becomes a contracted block when the desk can source an allotment at a fare worth pooling against.',
  notfound: 'That page is not on the board. The live corridors are — pick one and see what the group fare does to the festival surge.',
};

/** The document title for a route. Corridor pages name the corridor itself. */
export function routeTitle(route: RouteMatch, corridor: Corridor | null = null): string {
  if (route.name === 'corridor') {
    if (corridor) {
      return `${corridor.code} · ${corridor.origin_city} → ${corridor.dest_city} · UtsavAir`;
    }
    return route.code ? `${route.code} · UtsavAir` : BOARD_TITLE;
  }
  if (route.name === 'trips') return 'My trips · UtsavAir';
  if (route.name === 'carriers') return 'Carrier desk · UtsavAir';
  if (route.name === 'requests') return 'Corridor requests · UtsavAir';
  if (route.name === 'notfound') return 'Page not found · UtsavAir';
  return BOARD_TITLE;
}

/**
 * The meta description for a route. A corridor gets its own facts, because that
 * is the page someone shares into a family group chat.
 */
export function routeDescription(route: RouteMatch, corridor: Corridor | null = null): string {
  if (route.name === 'corridor' && corridor) {
    return [
      `${corridor.origin_city} → ${corridor.dest_city}, ${formatDate(corridor.departure_date)},`,
      `${corridor.carrier_name} ${corridor.service_number}.`,
      `${corridor.pledged_seats} of ${corridor.total_allotment} seats pledged;`,
      `landed from ${rupees(landedPerSeat(corridor))} a seat, against a festival`,
      `surge of ${rupees(corridor.festival_surge_fare)} (${ratio(surgeMultiple(corridor))} off-season).`,
    ].join(' ');
  }
  return DESCRIPTIONS[route.name];
}

/** Absolute URL for a route path, for canonical and sitemap entries. */
export function absoluteUrl(path: string): string {
  if (path === '/') return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Escape text for an HTML attribute value or a text node. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
