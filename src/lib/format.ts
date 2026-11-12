import type { Corridor, Quote, Tier } from './types';

/* ------------------------------------------------------------------ money */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function rupees(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `₹${inr.format(Math.round(value))}`;
}

export function compactRupees(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return rupees(value);
}

export function number(value: number): string {
  return inr.format(Math.round(value));
}

export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function ratio(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}×`;
}

/* ------------------------------------------------------------------- time */

const IST = 'Asia/Kolkata';

function toDate(iso: string): Date {
  // Postgres `date` columns arrive as YYYY-MM-DD; anchor those to IST midnight.
  return new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso);
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: IST,
});

const dateYearFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: IST,
});

const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: IST });

const clockFmt = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: IST,
});

export function formatDate(iso: string): string {
  const d = toDate(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function formatDateYear(iso: string): string {
  const d = toDate(iso);
  return Number.isNaN(d.getTime()) ? iso : dateYearFmt.format(d);
}

export function formatWeekday(iso: string): string {
  const d = toDate(iso);
  return Number.isNaN(d.getTime()) ? '' : weekdayFmt.format(d);
}

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${dateFmt.format(d)} · ${clockFmt.format(d)}`;
}

/** Clock string from an epoch-ms timestamp (avoids an ISO round-trip). */
export function formatClockMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return clockFmt.format(new Date(ms));
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : clockFmt.format(d);
}

/** Human countdown, coarse-grained on purpose: days then hours, hours then minutes. */
export function countdown(iso: string, now: number): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';
  const diff = target - now;
  if (diff <= 0) return 'closed';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function msUntil(iso: string, now: number): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return target - now;
}

export function daysUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil(msUntil(iso, now) / 86_400_000));
}

export function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  if (diff < 45_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(iso);
}

/* --------------------------------------------------------------- corridor */

export function surgeMultiple(c: Corridor): number {
  return c.normal_fare > 0 ? c.festival_surge_fare / c.normal_fare : 0;
}

export function netFareAt(c: Corridor, pledgedSeats: number): number {
  if (pledgedSeats >= c.tier3_min) return c.tier3_fare;
  if (pledgedSeats >= c.tier2_min) return c.tier2_fare;
  return c.tier1_fare;
}

export function feeOn(net: number, feePct: number): number {
  return Math.round(net * (feePct / 100));
}

export function activeNetFare(c: Corridor): number {
  return netFareAt(c, c.pledged_seats);
}

export function activeFee(c: Corridor): number {
  return feeOn(activeNetFare(c), c.platform_fee_pct);
}

export function landedPerSeat(c: Corridor): number {
  return activeNetFare(c) + activeFee(c);
}

export function savingPerSeat(c: Corridor): number {
  return Math.max(0, c.festival_surge_fare - landedPerSeat(c));
}

export function savingPct(c: Corridor): number {
  if (c.festival_surge_fare <= 0) return 0;
  return (savingPerSeat(c) / c.festival_surge_fare) * 100;
}

export function seatsLeft(c: Corridor): number {
  return Math.max(0, c.total_allotment - c.pledged_seats);
}

export function fillPct(c: Corridor): number {
  if (c.total_allotment <= 0) return 0;
  return Math.min(100, (c.pledged_seats / c.total_allotment) * 100);
}

export function isFull(c: Corridor): boolean {
  return seatsLeft(c) === 0;
}

export function isClosed(c: Corridor, now: number): boolean {
  return msUntil(c.lock_deadline, now) <= 0;
}

export function tiers(c: Corridor): Tier[] {
  const seats = c.pledged_seats;
  const defs: { id: 1 | 2 | 3; label: string; min: number; net: number }[] = [
    { id: 1, label: 'Tier I', min: c.tier1_min, net: c.tier1_fare },
    { id: 2, label: 'Tier II', min: c.tier2_min, net: c.tier2_fare },
    { id: 3, label: 'Tier III', min: c.tier3_min, net: c.tier3_fare },
  ];
  const nextIndex = defs.findIndex((t) => seats < t.min);
  return defs.map((t, i) => {
    const fee = feeOn(t.net, c.platform_fee_pct);
    return {
      id: t.id,
      label: t.label,
      min: t.min,
      net: t.net,
      fee,
      landed: t.net + fee,
      reached: seats >= t.min,
      next: i === nextIndex,
    };
  });
}

export function activeTier(c: Corridor): 0 | 1 | 2 | 3 {
  if (c.pledged_seats >= c.tier3_min) return 3;
  if (c.pledged_seats >= c.tier2_min) return 2;
  if (c.pledged_seats >= c.tier1_min) return 1;
  return 0;
}

/** Price a pledge of `seats`, assuming the cohort crosses the slab it lands in. */
export function quote(c: Corridor, seats: number): Quote {
  const projected = c.pledged_seats + seats;
  const net = netFareAt(c, projected);
  const fee = feeOn(net, c.platform_fee_pct);
  const landed = net + fee;

  const nextThreshold =
    projected < c.tier1_min
      ? c.tier1_min
      : projected < c.tier2_min
        ? c.tier2_min
        : projected < c.tier3_min
          ? c.tier3_min
          : null;

  const seatsToNextTier = nextThreshold ? Math.max(0, nextThreshold - projected) : 0;
  const nextNet = nextThreshold ? netFareAt(c, nextThreshold) : null;
  const nextLanded = nextNet === null ? null : nextNet + feeOn(nextNet, c.platform_fee_pct);
  const nextTierSaving = nextLanded === null ? 0 : Math.max(0, (landed - nextLanded) * seats);

  return {
    unitFare: net,
    feePerSeat: fee,
    landedPerSeat: landed,
    total: landed * seats,
    savingPerSeat: Math.max(0, c.festival_surge_fare - landed),
    totalSaving: Math.max(0, (c.festival_surge_fare - landed) * seats),
    surgeTotal: c.festival_surge_fare * seats,
    tierReached: projected >= c.tier3_min ? 3 : projected >= c.tier2_min ? 2 : 1,
    seatsToNextTier,
    nextTierLanded: nextLanded,
    nextTierSaving,
  };
}

/* ------------------------------------------------------------------- text */

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '··';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  return `${digits.slice(0, 5)}••${digits.slice(-2)}`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "Vijayawada (Amaravati)" → "Vijayawada"; keeps the parenthetical when short. */
export function shortCity(city: string): string {
  const base = city.split('(')[0]?.trim() ?? city;
  return base.length > 0 ? base : city;
}
