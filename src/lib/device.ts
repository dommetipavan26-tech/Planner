/**
 * Anonymous device identity. There is no auth in this prototype, so "my trips"
 * and "watched corridors" are scoped to a UUID held in localStorage. The server
 * never trusts it for anything but filtering the caller's own rows.
 */
import type { DeskSession } from './types';

const KEY = 'utsavair.device';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export function deviceId(): string {
  if (cached) return cached;
  if (typeof window === 'undefined') {
    // Server render / verification pass: a stable throwaway id, never persisted.
    cached = uuid();
    return cached;
  }
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      cached = existing;
      return cached;
    }
    const fresh = uuid();
    window.localStorage.setItem(KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    cached = uuid();
    return cached;
  }
}

const RECENT_KEY = 'utsavair.recent';
const RECENT_LIMIT = 4;

export function recentCodes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rememberCode(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = [code, ...recentCodes().filter((c) => c !== code)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are a nicety, not a requirement */
  }
}

/* ------------------------------------------------------------------------- */

/**
 * Carrier desk session storage.
 *
 * sessionStorage, not localStorage: the token is a bearer credential for that
 * desk's own writes, and a shared desk machine should not still be signed in the
 * next morning. The tab is the session.
 *
 * What is stored is never trusted on its own — `useLedger` asks the ledger
 * whether the session is still live on load, and clears it when the ledger says
 * it has ended. Reading is defensive for the same reason: a hand-edited or
 * truncated value must not become a session object the UI believes in.
 */
const DESK_KEY = 'utsavair.desk';

export function readDeskSession(): DeskSession | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(DESK_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let row: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    row = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const token = typeof row.token === 'string' ? row.token : '';
  const carrierId = typeof row.carrierId === 'string' ? row.carrierId : '';
  const expiresAt = typeof row.expiresAt === 'string' ? row.expiresAt : '';
  if (token.length !== 64 || !carrierId || Number.isNaN(Date.parse(expiresAt))) return null;
  if (Date.parse(expiresAt) <= Date.now()) {
    clearDeskSession();
    return null;
  }
  return {
    token,
    carrierId,
    carrierName: typeof row.carrierName === 'string' ? row.carrierName : '',
    deskRef: typeof row.deskRef === 'string' ? row.deskRef : '',
    deskContact: typeof row.deskContact === 'string' ? row.deskContact : '',
    expiresAt,
  };
}

export function writeDeskSession(session: DeskSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DESK_KEY, JSON.stringify(session));
  } catch {
    /* no session storage: the desk stays signed in for this render only */
  }
}

export function clearDeskSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DESK_KEY);
  } catch {
    /* nothing to clear */
  }
}
