import type { Corridor, PledgeQuote, TierBreakdown } from './types';

const inr = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

export function rupees(value: number): string {
  return `₹${inr.format(Math.round(value))}`;
}

export function compactRupees(value: number): string {
  if (Math.abs(value) >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(value) >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return rupees(value);
}

export function number(value: number): string {
  return inr.format(value);
}

export function pct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

const dayFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  timeZone: 'Asia/Kolkata',
});

export function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00+05:30` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

export function formatDay(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00+05:30` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return dayFmt.format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

export function countdown(iso: string, now = Date.now()): string {
  const target = new Date(iso).getTime();
  const diff = target - now;
  if (Number.isNaN(target)) return '—';
  if (diff <= 0) return 'closed';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function daysUntil(iso: string, now = Date.now()): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 86_400_000));
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function surgeMultiple(corridor: Corridor): number {
  if (!corridor.normal_fare) return 0;
  return corridor.festival_surge_fare / corridor.normal_fare;
}

export function fillPct(corridor: Corridor): number {
  if (!corridor.total_allotment) return 0;
  return Math.min(100, (corridor.pledged_seats / corridor.total_allotment) * 100);
}

export function seatRemaining(corridor: Corridor): number {
  return Math.max(0, corridor.total_allotment - corridor.pledged_seats);
}

export function activeUnitFare(corridor: Corridor): number {
  if (corridor.pledged_seats >= corridor.tier3_min) return corridor.tier3_fare;
  if (corridor.pledged_seats >= corridor.tier2_min) return corridor.tier2_fare;
  return corridor.tier1_fare;
}

export function landedPerSeat(corridor: Corridor): number {
  return Math.round(activeUnitFare(corridor) * (1 + corridor.platform_fee_pct / 100));
}

export function feePerSeat(corridor: Corridor): number {
  return Math.round(activeUnitFare(corridor) * (corridor.platform_fee_pct / 100));
}

export function tiersFor(corridor: Corridor): TierBreakdown[] {
  const seats = corridor.pledged_seats;
  const raw: TierBreakdown[] = [
    {
      label: 'Tier I',
      min: corridor.tier1_min,
      fare: corridor.tier1_fare,
      fee: 0,
      landed: 0,
      reached: seats >= corridor.tier1_min,
      next: false,
    },
    {
      label: 'Tier II',
      min: corridor.tier2_min,
      fare: corridor.tier2_fare,
      fee: 0,
      landed: 0,
      reached: seats >= corridor.tier2_min,
      next: false,
    },
    {
      label: 'Tier III',
      min: corridor.tier3_min,
      fare: corridor.tier3_fare,
      fee: 0,
      landed: 0,
      reached: seats >= corridor.tier3_min,
      next: false,
    },
  ];

  const nextIndex = raw.findIndex((t) => !t.reached);
  return raw.map((tier, i) => {
    const fee = Math.round(tier.fare * (corridor.platform_fee_pct / 100));
    return {
      ...tier,
      fee,
      landed: tier.fare + fee,
      next: i === nextIndex,
    };
  });
}

export function quoteFor(corridor: Corridor, seats: number): PledgeQuote {
  const projected = corridor.pledged_seats + seats;
  const fareAt = (count: number) => {
    if (count >= corridor.tier3_min) return corridor.tier3_fare;
    if (count >= corridor.tier2_min) return corridor.tier2_fare;
    return corridor.tier1_fare;
  };

  const unitFare = fareAt(projected);
  const feePer = Math.round(unitFare * (corridor.platform_fee_pct / 100));
  const landed = unitFare + feePer;
  const tierReached =
    projected >= corridor.tier3_min ? 3 : projected >= corridor.tier2_min ? 2 : 1;

  const nextThreshold =
    projected < corridor.tier1_min
      ? corridor.tier1_min
      : projected < corridor.tier2_min
        ? corridor.tier2_min
        : projected < corridor.tier3_min
          ? corridor.tier3_min
          : null;

  const seatsToNextTier = nextThreshold ? Math.max(0, nextThreshold - projected) : 0;
  const nextTierSaving = nextThreshold
    ? Math.max(
        0,
        (landed -
          (fareAt(nextThreshold) +
            Math.round(fareAt(nextThreshold) * (corridor.platform_fee_pct / 100)))) *
          seats,
      )
    : 0;

  return {
    unitFare,
    feePerSeat: feePer,
    landedPerSeat: landed,
    total: landed * seats,
    savingPerSeat: Math.max(0, corridor.festival_surge_fare - landed),
    totalSaving: Math.max(0, (corridor.festival_surge_fare - landed) * seats),
    surgeTotal: corridor.festival_surge_fare * seats,
    tierReached,
    seatsToNextTier,
    nextTierSaving,
  };
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${digits.slice(0, 5)} •••${digits.slice(-2)}`;
}
