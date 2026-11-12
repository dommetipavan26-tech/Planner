/**
 * Anonymous device identity. There is no auth in this prototype, so "my trips"
 * and "watched corridors" are scoped to a UUID held in localStorage. The server
 * never trusts it for anything but filtering the caller's own rows.
 */
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
