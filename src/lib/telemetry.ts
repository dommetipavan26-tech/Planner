/**
 * Client error telemetry.
 *
 * The desk had no way of telling us anything had gone wrong: a render error
 * reached the console of whoever was watching it, a refused ledger write reached
 * a toast that vanished, and an offline fallback looked like a success to anyone
 * not reading the receipt closely. This module is the channel for those, and it
 * is deliberately small — one queue, one destination, no dependencies of its own.
 *
 * Destination: Vercel Web Analytics custom events, through `track()` from
 * `@vercel/analytics/react`, which is the instrumentation the site already loads.
 * It is imported lazily from inside the flush so it lands in the existing
 * `insights` chunk rather than in the app bundle, and nothing is imported at all
 * when there is nothing to send.
 *
 * Three constraints shaped it:
 *
 * 1. **`track()` drops events fired before the collector script loads** — it calls
 *    `window.va` and does nothing when that is undefined, and there is no queue
 *    behind it. Errors are most likely in the first moments of a page, so this
 *    module keeps its own buffer and retries for about twelve seconds, then gives
 *    up. An error that could not be delivered is not an error that did not
 *    happen, and the caps below exist so the retry cannot become a loop.
 *
 * 2. **Nothing identifying leaves the browser.** Messages are passed through
 *    `redact()` first, which replaces email addresses, digit runs long enough to
 *    be a mobile number, UUIDs, session tokens and booking references. Property
 *    values are flattened to strings and numbers. No passenger name, no phone
 *    number, no device id, no desk passcode — those are exactly the values this
 *    project keeps out of its public rows, and telemetry is a public-ish
 *    destination.
 *
 * 3. **It cannot make things worse.** Every cap is a hard stop, the flush swallows
 *    its own failures, and the whole module is inert during server render and
 *    prerender, where `window` does not exist.
 */

type TelemetryProps = Record<string, string | number | boolean | null>;

interface Queued {
  name: string;
  props: TelemetryProps;
}

/** Hard ceiling per page view, across every event name. */
const MAX_EVENTS_PER_PAGE = 24;
/** Hard ceiling for one event name, so a loop cannot spend the whole budget. */
const MAX_PER_NAME = 8;
/** Identical events inside this window are one event. */
const DEDUPE_WINDOW_MS = 5_000;
/** Longest message that leaves the browser. */
const MAX_DETAIL = 180;
/** How long to keep trying to reach a collector that has not loaded yet. */
const FLUSH_ATTEMPTS = 12;
const FLUSH_INTERVAL_MS = 1_000;

const queue: Queued[] = [];
const perName = new Map<string, number>();
const lastSeen = new Map<string, number>();

let sent = 0;
let attempts = 0;
let flushing = false;
let installed = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const inBrowser = typeof window !== 'undefined';

/** The route as the reader sees it, without the query string or the origin. */
function currentRoute(): string {
  if (!inBrowser) return 'prerender';
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path.length > 80 ? `${path.slice(0, 80)}…` : path;
}

/**
 * Strip anything that could identify a traveller, a desk or a booking.
 *
 * Order matters: the UUID pattern has to run before the digit-run pattern, or a
 * device id would arrive as a smear of `[digits]` that still leaks its shape.
 */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[token]')
    .replace(/\bUTV-[A-Z0-9]{4,10}\b/g, '[ref]')
    .replace(/\b\d{10,}\b/g, '[digits]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DETAIL);
}

/** Flatten and redact a property bag into something safe to hand to `track()`. */
function cleanProps(props: Record<string, unknown>): TelemetryProps {
  const out: TelemetryProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') {
      out[key] = Number.isFinite(value) ? value : null;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = redact(value);
    } else if (value instanceof Error) {
      out[key] = redact(`${value.name}: ${value.message}`);
    } else {
      // Nested objects are not supported by the collector anyway.
      out[key] = redact(String(value));
    }
  }
  return out;
}

/**
 * Report one event.
 *
 * Safe to call from anywhere, including render-adjacent code paths: it never
 * throws, never awaits anything the caller has to wait for, and stops accepting
 * events once the page has spent its budget.
 */
export function reportEvent(name: string, props: Record<string, unknown> = {}): void {
  if (!inBrowser) return;

  const clean = cleanProps({ route: currentRoute(), ...props });
  const key = `${name}|${JSON.stringify(clean)}`;
  const now = Date.now();

  const previous = lastSeen.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return;

  const count = perName.get(name) ?? 0;
  if (count >= MAX_PER_NAME) return;
  if (sent + queue.length >= MAX_EVENTS_PER_PAGE) return;

  lastSeen.set(key, now);
  perName.set(name, count + 1);
  queue.push({ name, props: clean });
  void flush();
}

/** True once the Vercel collector has installed its `window.va` entry point. */
function collectorReady(): boolean {
  if (!inBrowser) return false;
  return typeof (window as unknown as { va?: unknown }).va === 'function';
}

function scheduleRetry(): void {
  if (retryTimer !== null || attempts >= FLUSH_ATTEMPTS) return;
  attempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Send what is buffered, if there is anything to send it with.
 *
 * One event at a time inside its own try, so a collector that throws halfway
 * through a batch costs one event rather than the whole buffer.
 */
async function flush(): Promise<void> {
  if (!inBrowser || flushing || queue.length === 0) return;
  if (!collectorReady()) {
    scheduleRetry();
    return;
  }

  flushing = true;
  try {
    const { track } = await import('@vercel/analytics/react');
    while (queue.length > 0) {
      const event = queue[0];
      if (!event) break;
      try {
        track(event.name, event.props);
        sent += 1;
      } catch {
        // The collector refused it. Dropping one event is cheaper than retrying
        // something that has already failed once.
      }
      queue.shift();
    }
  } catch {
    // The instrumentation chunk could not be fetched — offline, blocked, or a
    // stale hash after a deploy. The buffer keeps what it has and the retry timer
    // will try again, up to its cap.
    scheduleRetry();
  } finally {
    flushing = false;
  }
}

/** Last path segment only: a full script URL would publish the deployment host. */
function scriptLabel(filename: string | null | undefined): string {
  if (!filename) return 'unknown';
  const parts = filename.split('/');
  const last = parts[parts.length - 1] ?? 'unknown';
  return last.length > 60 ? last.slice(-60) : last;
}

/**
 * Start listening for errors this app cannot catch itself: an exception escaping
 * an event handler, and a promise nobody awaited.
 *
 * Called once from the entry point. Idempotent, and inert during server render,
 * so the prerender pass and the render check both see it do nothing.
 */
export function installErrorTelemetry(): void {
  if (!inBrowser || installed) return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    reportEvent('ui_window_error', {
      detail: event.message ?? 'unknown',
      file: scriptLabel(event.filename),
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    reportEvent('ui_promise_rejection', {
      detail: reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? 'unknown'),
    });
  });

  // A reader who closes the tab takes the buffer with them. One last attempt is
  // cheap; anything still queued after it is dropped, by design.
  window.addEventListener('pagehide', () => {
    if (collectorReady()) void flush();
  });
}

/**
 * Report a ledger outcome that the reader can already see, in terms an operator
 * can aggregate: which write, whether it landed, and why it did not.
 *
 * `simulated` writes matter most. They are the case where the desk looks like it
 * took a pledge and Postgres never heard about it, and until now the only record
 * of that was a toast on one person's screen.
 */
export function reportLedgerOutcome(
  action: 'join' | 'bid' | 'request' | 'upvote' | 'watch' | 'signin',
  outcome: 'refused' | 'throttled' | 'simulated' | 'duplicate' | 'offline',
  detail?: unknown,
): void {
  const name =
    outcome === 'simulated' || outcome === 'offline'
      ? 'ledger_write_not_persisted'
      : outcome === 'throttled'
        ? 'ledger_write_throttled'
        : outcome === 'duplicate'
          ? 'ledger_write_duplicate'
          : 'ledger_write_refused';
  reportEvent(name, { action, outcome, detail: detail === undefined ? null : String(detail) });
}
