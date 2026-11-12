import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../lib/router';
import { useNow } from '../hooks/useClock';
import {
  activeTier,
  countdown,
  feeOn,
  formatDateYear,
  initials,
  isClosed,
  isFull,
  maskPhone,
  netFareAt,
  pct,
  pluralise,
  quote,
  rupees,
  seatsLeft,
  surgeMultiple,
} from '../lib/format';
import type { Corridor, Pledge } from '../lib/types';
import type { JoinInput, Result } from '../hooks/useLedger';
import {
  Button,
  Chip,
  Divider,
  Field,
  SelectInput,
  Sheet,
  Stepper,
  TextInput,
  cn,
} from './ui';
import { QuoteBreakdown } from './Pricing';
import {
  IconAlert,
  IconArrow,
  IconBus,
  IconCheck,
  IconClock,
  IconPin,
  IconPlane,
  IconShield,
  IconTicket,
} from './icons';

const COHORTS = [
  'Family / relatives',
  'Student wing (ID verified)',
  'Temple / community group',
  'Company or PSU staff group',
  'Wedding party',
  'Friends travelling together',
  'General cohort',
];

interface Errors {
  name?: string;
  phone?: string;
  boardingPoint?: string;
  seats?: string;
}

const PHONE_RE = /^[6-9]\d{9}$/;

function validate(form: {
  name: string;
  phone: string;
  boardingPoint: string;
  seats: number;
  maxSeats: number;
}): Errors {
  const errors: Errors = {};
  const name = form.name.trim();
  if (name.length < 3) errors.name = 'Enter the lead passenger name as it appears on ID.';
  else if (!/^[\p{L}\s.'-]{3,}$/u.test(name))
    errors.name = 'Letters, spaces, hyphens and apostrophes only.';

  const digits = form.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!PHONE_RE.test(digits)) errors.phone = 'A 10-digit Indian mobile number, starting 6–9.';

  if (!form.boardingPoint) errors.boardingPoint = 'Choose a boarding point for the manifest.';

  if (form.seats < 1) errors.seats = 'At least one seat.';
  else if (form.seats > 8) errors.seats = 'One pledge can hold a maximum of 8 seats.';
  else if (form.seats > form.maxSeats)
    errors.seats = `Only ${form.maxSeats} ${pluralise(form.maxSeats, 'seat')} left in this block.`;

  return errors;
}

export function JoinSheet({
  corridor,
  open,
  onClose,
  onJoin,
  onToast,
}: {
  corridor: Corridor | null;
  open: boolean;
  onClose: () => void;
  onJoin: (input: JoinInput) => Promise<Result<Pledge>>;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const now = useNow();
  const [seats, setSeats] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cohort, setCohort] = useState(COHORTS[0] ?? 'General cohort');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Pledge | null>(null);
  const [simulated, setSimulated] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const boardingRef = useRef<HTMLSelectElement>(null);

  const maxSeats = corridor ? Math.min(8, seatsLeft(corridor)) : 8;
  const points = corridor?.boarding_points ?? [];

  // Reset the form whenever a different corridor is opened.
  useEffect(() => {
    if (!open || !corridor) return;
    setSeats(Math.min(2, Math.max(1, seatsLeft(corridor))));
    setErrors({});
    setTouched({});
    setReceipt(null);
    setSimulated(false);
    setBoardingPoint(points[0] ?? '');
    // Re-seeding on corridor change is deliberate: `points` is derived from it.
  }, [open, corridor?.id, points]);

  const q = useMemo(() => (corridor ? quote(corridor, seats) : null), [corridor, seats]);

  const revalidate = useCallback(
    (next: Partial<{ name: string; phone: string; boardingPoint: string; seats: number }>) => {
      if (!corridor) return;
      const merged = { name, phone, boardingPoint, seats, ...next };
      setErrors(validate({ ...merged, maxSeats }));
    },
    [corridor, name, phone, boardingPoint, seats, maxSeats],
  );

  const update = useCallback(
    <K extends 'name' | 'phone' | 'boardingPoint' | 'seats'>(
      key: K,
      value: K extends 'seats' ? number : string,
    ) => {
      if (key === 'seats') setSeats(value as number);
      else if (key === 'name') setName(value as string);
      else if (key === 'phone') setPhone(value as string);
      else setBoardingPoint(value as string);
      setTouched((t) => ({ ...t, [key]: true }));
      revalidate({ [key]: value } as never);
    },
    [revalidate],
  );

  const submit = useCallback(async () => {
    if (!corridor) return;
    const found = validate({ name, phone, boardingPoint, seats, maxSeats });
    setErrors(found);
    setTouched({ name: true, phone: true, boardingPoint: true, seats: true });

    if (found.name) {
      nameRef.current?.focus();
      return;
    }
    if (found.phone) {
      phoneRef.current?.focus();
      return;
    }
    if (found.boardingPoint) {
      boardingRef.current?.focus();
      return;
    }
    if (found.seats) return;

    setSubmitting(true);
    const result = await onJoin({
      corridorId: corridor.id,
      name: name.trim(),
      phone: phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
      cohort,
      boardingPoint,
      seats,
    });
    setSubmitting(false);

    if (!result.ok || !result.data) {
      onToast(result.error ?? 'The ledger rejected that pledge. Try again.', 'error');
      return;
    }
    setReceipt(result.data);
    setSimulated(Boolean(result.simulated));
    onToast(
      result.simulated
        ? `Seat hold recorded locally as ${result.data.booking_ref}`
        : `${result.data.booking_ref} is on the live ledger`,
      'success',
    );
  }, [corridor, name, phone, boardingPoint, seats, maxSeats, cohort, onJoin, onToast]);

  const copyRef = useCallback(async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.booking_ref);
      onToast('Booking reference copied', 'info');
    } catch {
      onToast(`Reference: ${receipt.booking_ref}`, 'info');
    }
  }, [receipt, onToast]);

  if (!corridor) return null;

  const closed = isFull(corridor) || isClosed(corridor, now);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={receipt ? `Held · ${receipt.booking_ref}` : `Hold seats · ${corridor.code}`}
      description={
        receipt
          ? 'Nothing is charged until the corridor clears Tier I. Save this reference.'
          : `${corridor.origin_city} → ${corridor.dest_city} · ${formatDateYear(corridor.departure_date)} · ${corridor.carrier_name}`
      }
      footer={
        receipt ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11.5px] leading-snug text-mist-dim">
              Manifest closes{' '}
              <span className="tnum text-mist">
                {corridor.manifest_deadline ? formatDateYear(corridor.manifest_deadline) : '72h before departure'}
              </span>
              . Name changes are free until then.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="quiet" onClick={copyRef}>
                Copy reference
              </Button>
              <Link
                to="/trips"
                onClick={onClose}
                className="inline-flex h-8 items-center justify-center rounded-pill bg-marigold px-3 text-[12.5px] font-medium text-night-900 transition-colors duration-200 hover:bg-[#f0b25a]"
              >
                View my trips
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[11.5px] leading-snug text-mist-dim">
              <IconShield size={14} className="mt-px shrink-0 text-jade" />
              <span>
                No card is charged now. If Tier I is not reached by{' '}
                <span className="tnum text-mist">{countdown(corridor.lock_deadline, now)}</span>, the
                pledge is released automatically.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={submitting}
                disabled={closed || submitting}
                onClick={submit}
                icon={<IconTicket size={14} />}
              >
                {closed
                  ? 'Block closed'
                  : q
                    ? `Hold ${seats} ${seats === 1 ? 'seat' : 'seats'} · ${rupees(q.total)}`
                    : 'Hold seats'}
              </Button>
            </div>
          </div>
        )
      }
    >
      {receipt ? (
        <Receipt pledge={receipt} corridor={corridor} simulated={simulated} />
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            noValidate
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="micro text-mist-dim">Seats in your party</span>
                <Stepper
                  value={seats}
                  min={1}
                  max={Math.max(1, maxSeats)}
                  onChange={(next) => update('seats', next)}
                  label="Seats"
                  disabled={closed}
                />
              </div>
              <p className="tnum text-[11.5px] text-mist-dim">
                {seatsLeft(corridor)} of {corridor.total_allotment} left in the block
              </p>
            </div>
            {errors.seats && touched.seats ? (
              <p role="alert" className="flex items-center gap-1.5 text-[11.5px] text-ember">
                <IconAlert size={12} /> {errors.seats}
              </p>
            ) : null}

            <Field
              label="Lead passenger"
              htmlFor="join-name"
              required
              error={touched.name ? errors.name : null}
              hint={`${name.trim().length}/3 characters`}
            >
              <TextInput
                id="join-name"
                ref={nameRef}
                value={name}
                autoComplete="name"
                placeholder="As printed on government ID"
                invalid={Boolean(touched.name && errors.name)}
                onChange={(e) => update('name', e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, name: true }));
                  revalidate({});
                }}
              />
            </Field>

            <Field
              label="Mobile number"
              htmlFor="join-phone"
              required
              error={touched.phone ? errors.phone : null}
              hint="used only for manifest alerts"
            >
              <TextInput
                id="join-phone"
                ref={phoneRef}
                value={phone}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={13}
                placeholder="10-digit number"
                className="tnum"
                invalid={Boolean(touched.phone && errors.phone)}
                onChange={(e) => update('phone', e.target.value.replace(/[^\d+\s-]/g, ''))}
                onBlur={() => {
                  setTouched((t) => ({ ...t, phone: true }));
                  revalidate({});
                }}
              />
            </Field>

            <Field label="Boarding point" htmlFor="join-boarding" required error={touched.boardingPoint ? errors.boardingPoint : null}>
              <SelectInput
                id="join-boarding"
                ref={boardingRef}
                value={boardingPoint}
                invalid={Boolean(touched.boardingPoint && errors.boardingPoint)}
                onChange={(e) => update('boardingPoint', e.target.value)}
              >
                {points.length === 0 ? <option value="">No boarding point published</option> : null}
                {points.map((point) => (
                  <option key={point} value={point}>
                    {point}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Travelling as" htmlFor="join-cohort" hint="helps the carrier desk group manifests">
              <SelectInput id="join-cohort" value={cohort} onChange={(e) => setCohort(e.target.value)}>
                {COHORTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            </Field>

            {corridor.mode === 'bus' ? (
              <p className="flex items-start gap-2 rounded-card border border-line bg-night-850 px-3 py-2.5 text-[11.5px] leading-snug text-mist-dim">
                <IconBus size={14} className="mt-px shrink-0 text-lagoon" />
                <span>
                  Coach blocks assign berths at manifest close, in pledge order. Families travelling
                  together are seated together where the layout allows it.
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-card border border-line bg-night-850 px-3 py-2.5 text-[11.5px] leading-snug text-mist-dim">
                <IconPlane size={14} className="mt-px shrink-0 text-marigold" />
                <span>
                  Group PNRs are issued to the lead passenger at manifest close. Names can be swapped
                  free until 72 hours before departure.
                </span>
              </p>
            )}

            {/* Hidden submit so Enter works inside the form */}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
              Hold seats
            </button>
          </form>

          <aside className="flex flex-col gap-3 rounded-card border border-line bg-night-850 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="micro text-mist-dim">Live quote</span>
              <Chip tone={q && q.seatsToNextTier === 0 ? 'jade' : 'marigold'}>
                Tier {q?.tierReached ?? 1}
              </Chip>
            </div>
            {q ? <QuoteBreakdown corridor={corridor} seats={seats} /> : null}
            <Divider className="my-1" />
            <div className="flex flex-col gap-1.5 text-[11px] leading-snug text-mist-faint">
              <span className="inline-flex items-center gap-1.5">
                <IconClock size={12} />
                Lock in <span className="tnum text-mist-dim">{countdown(corridor.lock_deadline, now)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconPin size={12} />
                {corridor.pickup_hub}
              </span>
            </div>
          </aside>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ receipt */

function Receipt({
  pledge,
  corridor,
  simulated,
}: {
  pledge: Pledge;
  corridor: Corridor;
  simulated: boolean;
}) {
  const projectedSeats = corridor.pledged_seats;
  const net = netFareAt(corridor, projectedSeats);
  const fee = feeOn(net, corridor.platform_fee_pct);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="animate-rise overflow-hidden rounded-card border border-line-bright bg-night-850"
        style={{ backgroundImage: 'radial-gradient(120% 80% at 100% 0%, rgba(232,163,61,0.10), transparent 60%)' }}
      >
        <div className="flex items-start justify-between gap-4 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-pill border border-marigold/40 bg-marigold-veil text-[13px] font-medium text-marigold">
              {initials(pledge.passenger_name)}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-ivory">{pledge.passenger_name}</span>
              <span className="tnum text-[11.5px] text-mist-dim">
                {maskPhone(pledge.passenger_phone)} · {pledge.passenger_cohort}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Chip tone={pledge.status === 'allotment_confirmed' ? 'jade' : 'marigold'} dot>
              {pledge.status === 'allotment_confirmed' ? 'Allotment confirmed' : 'Escrow held'}
            </Chip>
            <span className="tnum micro text-mist-faint">{pledge.booking_ref}</span>
          </div>
        </div>

        <div className="perforation h-px w-full" aria-hidden="true" />

        <div className="grid gap-4 px-4 py-3.5 sm:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="tnum display text-[24px] leading-none text-ivory">
                {corridor.origin_code}
              </span>
              <span className="micro mt-1 text-mist-faint">{corridor.departure_time}</span>
            </div>
            <div className="flex flex-1 flex-col items-center gap-1">
              <span className="micro text-mist-faint">{corridor.duration_label}</span>
              <span className="relative flex w-full items-center" aria-hidden="true">
                <span className="h-px flex-1 bg-line-bright" />
                <span className="mx-1 text-marigold">
                  {corridor.mode === 'bus' ? <IconBus size={13} /> : <IconPlane size={13} />}
                </span>
                <span className="h-px flex-1 bg-line-bright" />
              </span>
              <span className="micro text-mist-faint">{corridor.service_number}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="tnum display text-[24px] leading-none text-ivory">
                {corridor.dest_code}
              </span>
              <span className="micro mt-1 text-mist-faint">{corridor.arrival_time}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[12.5px] text-mist">{formatDateYear(corridor.departure_date)}</span>
            <span className="text-[11.5px] text-mist-dim">{corridor.carrier_name}</span>
          </div>
        </div>

        <div className="perforation h-px w-full" aria-hidden="true" />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3.5 sm:grid-cols-4">
          <Cell label="Seats" value={String(pledge.seats)} />
          <Cell label="Carrier net" value={rupees(pledge.locked_unit_fare || net)} />
          <Cell label={`Fee ${pct(corridor.platform_fee_pct, 1)}`} value={rupees(pledge.platform_fee_unit || fee)} />
          <Cell label="Payable at lock" value={rupees(pledge.total_payable)} tone="marigold" />
        </dl>

        <div className="barcode h-8 w-full opacity-45" aria-hidden="true" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-night-900 px-3.5 py-3">
          <span className="micro text-mist-dim">Boarding point</span>
          <p className="mt-1.5 flex items-start gap-2 text-[12.5px] leading-snug text-ivory">
            <IconPin size={13} className="mt-0.5 shrink-0 text-marigold" />
            {pledge.boarding_point || corridor.pickup_hub}
          </p>
        </div>
        <div className="rounded-card border border-line bg-night-900 px-3.5 py-3">
          <span className="micro text-mist-dim">Saving vs surge</span>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="tnum text-[16px] font-medium text-jade">
              {rupees(pledge.estimated_saving)}
            </span>
            <span className="text-[11.5px] text-mist-dim">
              surge was {surgeMultiple(corridor).toFixed(1)}× at{' '}
              {rupees(pledge.max_willing_fare)}
            </span>
          </p>
        </div>
      </div>

      {activeTier(corridor) === 0 ? (
        <p className="flex items-start gap-2 rounded-card border border-[#3b2d17] bg-marigold-veil/70 px-3.5 py-2.5 text-[11.5px] leading-snug text-marigold">
          <IconAlert size={14} className="mt-px shrink-0" />
          <span>
            The corridor is still below Tier I. Your seat is reserved in the cohort and the price
            above is what you pay <em className="not-italic text-ivory">if</em> the block confirms. If
            it does not, nothing is charged and the pledge is released.
          </span>
        </p>
      ) : null}

      {simulated ? (
        <p className="flex items-start gap-2 rounded-card border border-line bg-night-850 px-3.5 py-2.5 text-[11.5px] leading-snug text-mist-dim">
          <IconAlert size={14} className="mt-px shrink-0 text-clay" />
          <span>
            Postgres is unreachable from this browser, so this hold is stored locally on your device
            only. It will not appear on the shared ledger until the connection returns.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-mist-faint">
        <span className="inline-flex items-center gap-1.5">
          <IconCheck size={12} className="text-jade" />
          Free name swap until T-72h
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IconCheck size={12} className="text-jade" />
          25% EMD only after Tier II clears
        </span>
        <Link
          to={`/corridor/${encodeURIComponent(corridor.code)}`}
          className="inline-flex items-center gap-1 text-mist-dim transition-colors duration-200 hover:text-marigold"
        >
          Back to {corridor.code} <IconArrow size={11} />
        </Link>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'marigold';
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="micro text-mist-faint">{label}</dt>
      <dd className={cn('tnum text-[14px] font-medium', tone ? 'text-marigold' : 'text-ivory')}>
        {value}
      </dd>
    </div>
  );
}
