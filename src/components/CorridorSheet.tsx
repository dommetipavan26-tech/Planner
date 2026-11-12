import { useEffect, useMemo, useState } from 'react';
import type { CarrierBid, Corridor, DeskSource, Pledge } from '../lib/types';
import {
  countdown,
  formatDate,
  formatDateTime,
  initials,
  quoteFor,
  relativeTime,
  rupees,
  seatRemaining,
  surgeMultiple,
  tiersFor,
} from '../lib/format';
import type { JoinPayload } from '../hooks/useCorridorDesk';
import { SurgeChart } from './SurgeChart';
import { ModeTag } from './LiveBoard';
import { Button, Field, KeyValue, Select, StatusDot, Tag, TextInput, TierMeter } from './ui';

const EMPTY_FORM = {
  name: '',
  phone: '',
  cohort: '',
  boardingPoint: '',
};

export function CorridorSheet({
  corridor,
  pledges,
  bids,
  source,
  onClose,
  onJoin,
}: {
  corridor: Corridor | null;
  pledges: Pledge[];
  bids: CarrierBid[];
  source: DeskSource;
  onClose: () => void;
  onJoin: (payload: JoinPayload) => Promise<{ ok: boolean; data?: Pledge; error?: string; simulated?: boolean }>;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [seats, setSeats] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Pledge | null>(null);
  const [receiptNote, setReceiptNote] = useState<string | null>(null);

  useEffect(() => {
    setForm(EMPTY_FORM);
    setSeats(1);
    setErrors({});
    setReceipt(null);
    setReceiptNote(null);
    setSubmitting(false);
  }, [corridor?.id]);

  useEffect(() => {
    if (!corridor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [corridor, onClose]);

  const cohortPledges = useMemo(
    () => pledges.filter((p) => p.corridor_id === corridor?.id).slice(0, 6),
    [pledges, corridor?.id],
  );

  if (!corridor) return null;

  const c = corridor;
  const remaining = seatRemaining(c);
  const tiers = tiersFor(c);
  const quote = quoteFor(c, seats);
  const bid = bids.find((b) => b.corridor_code === c.code);
  const closed = remaining === 0;

  const update = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 3) next.name = 'Enter the lead passenger name as per ID.';
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 10) next.phone = 'A 10-digit Indian mobile number is required.';
    if (form.boardingPoint.trim().length < 3) next.boardingPoint = 'Pick or type a boarding point.';
    if (seats < 1 || seats > 8) next.seats = 'One pledge can hold 1 to 8 seats.';
    if (seats > remaining) next.seats = `Only ${remaining} seat(s) remain in this block.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    const result = await onJoin({
      corridorId: c.id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      cohort: form.cohort.trim() || 'General cohort',
      boardingPoint: form.boardingPoint.trim(),
      seats,
    });
    setSubmitting(false);

    if (!result.ok || !result.data) {
      setErrors({ form: result.error ?? 'Could not record the pledge.' });
      return;
    }
    setReceipt(result.data);
    setReceiptNote(
      result.simulated
        ? 'Held in the local snapshot ledger — Postgres is unreachable from this browser, so nothing was committed.'
        : 'Written to Postgres through utsav_join_cohort() and streamed to every open board.',
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={`${c.code} corridor detail`}>
      <button
        type="button"
        aria-label="Close corridor detail"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[1px]"
      />
      <div className="animate-sheet-in relative flex h-full w-full max-w-[720px] flex-col overflow-hidden border-l border-hairline bg-paper shadow-[-30px_0_60px_-40px_rgba(11,14,20,0.7)]">
        {/* Header */}
        <header className="shrink-0 border-b border-hairline bg-paper-3 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink-400">{c.code}</span>
                <ModeTag mode={c.mode} />
                <Tag tone="neutral">{c.festival}</Tag>
              </div>
              <h2 className="font-display mt-1.5 text-[22px] leading-tight font-medium tracking-[-0.015em] text-ink">
                {c.origin_city} <span className="text-ink-300">→</span> {c.dest_city}
              </h2>
              <p className="mt-1 text-[12px] text-ink-400">
                {c.carrier_name} · {c.service_number} · {formatDate(c.departure_date)} ·{' '}
                {c.departure_time}–{c.arrival_time} IST
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card border border-hairline text-ink-500 transition-colors hover:border-ink hover:text-ink"
              aria-label="Close"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </svg>
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 px-5 py-5">
            {/* Cohort state */}
            <section className="rounded-card border border-hairline bg-paper-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="micro text-ink-400">cohort fill</p>
                <p className="tnum font-mono text-[11.5px] text-ink-500">
                  {c.pledged_seats} of {c.total_allotment} seats pledged ·{' '}
                  {remaining > 0 ? `${remaining} left` : 'block full'}
                </p>
              </div>
              <div className="mt-3">
                <TierMeter
                  pledged={c.pledged_seats}
                  total={c.total_allotment}
                  gates={[c.tier1_min, c.tier2_min, c.tier3_min]}
                />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-300">
                <span>0</span>
                <span>{c.tier1_min}</span>
                <span>{c.tier2_min}</span>
                <span>{c.tier3_min}</span>
                <span>{c.total_allotment}</span>
              </div>

              <div className="mt-4 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-3">
                {tiers.map((t) => (
                  <div
                    key={t.label}
                    className={`px-3 py-2.5 ${
                      t.reached ? 'bg-verdant-soft' : t.next ? 'bg-marigold-soft' : 'bg-paper-3'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="micro text-ink-500">{t.label}</p>
                      {t.reached ? (
                        <StatusDot tone="verdant" />
                      ) : t.next ? (
                        <StatusDot tone="marigold" pulse />
                      ) : (
                        <StatusDot tone="neutral" />
                      )}
                    </div>
                    <p className="tnum font-mono mt-1 text-[15px] font-semibold text-ink">
                      {rupees(t.landed)}
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-ink-500">
                      at {t.min} seats · net {rupees(t.fare)} + {rupees(t.fee)} fee
                    </p>
                    {t.next && !t.reached ? (
                      <p className="tnum mt-1.5 text-[10.5px] font-semibold text-marigold">
                        {Math.max(0, t.min - c.pledged_seats)} more seats to unlock
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
                Allotment locks in <strong className="font-semibold text-ink">{countdown(c.lock_deadline)}</strong>{' '}
                ({formatDateTime(c.lock_deadline)} IST). If the cohort has not crossed Tier I by then,
                every pledge is released and refunded in full.
              </p>
            </section>

            {/* Fare argument */}
            <section className="rounded-card border border-hairline bg-paper-3 p-4">
              <SurgeChart corridor={c} />
              <p className="mt-3 border-t border-hairline-soft pt-3 text-[11.5px] leading-relaxed text-ink-500">
                Festival retail on this corridor runs {surgeMultiple(c).toFixed(1)}× the off-season
                baseline of {rupees(c.normal_fare)}. The contracted group rate card sits below it
                because carriers sell 10+ seat blocks at a committed net fare with an EMD deposit and
                a named manifest deadline — a rate individual buyers cannot reach.
              </p>
            </section>

            {/* Contract terms */}
            <section className="rounded-card border border-hairline bg-paper-3 p-4">
              <p className="micro mb-2 text-ink-400">carrier contract terms</p>
              <KeyValue k="contract ref" v={c.contract_ref} mono />
              <KeyValue k="group desk" v={bid?.carrier_name ?? c.carrier_name} />
              <KeyValue k="hold window" v={`${bid?.hold_window_hours ?? 72} hours after tier lock`} />
              <KeyValue k="baggage" v={c.baggage_allowance} />
              <KeyValue k="reporting point" v={c.pickup_hub} />
              <KeyValue
                k="net group fare"
                v={rupees(
                  c.pledged_seats >= c.tier3_min
                    ? c.tier3_fare
                    : c.pledged_seats >= c.tier2_min
                      ? c.tier2_fare
                      : c.tier1_fare,
                )}
                mono
              />
              {bid?.notes ? (
                <p className="mt-3 border-t border-hairline-soft pt-3 text-[11.5px] leading-relaxed text-ink-500">
                  <span className="micro mr-1.5 text-ink-400">desk note</span>
                  {bid.notes}
                </p>
              ) : null}
            </section>

            {/* Cohort members */}
            <section className="rounded-card border border-hairline bg-paper-3 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="micro text-ink-400">in this cohort</p>
                <p className="micro text-ink-300">{cohortPledges.length} shown</p>
              </div>
              {cohortPledges.length === 0 ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400">
                  No pledges recorded yet. The first 15 seats are what turn a route into a corridor —
                  anchor it with your group and the Tier I slab releases for everyone behind you.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-hairline-soft">
                  {cohortPledges.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-paper-2 font-mono text-[10.5px] font-semibold text-ink-500">
                        {initials(p.passenger_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">
                          {p.passenger_name}
                        </span>
                        <span className="block truncate text-[11px] text-ink-400">
                          {p.passenger_cohort} · {relativeTime(p.created_at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tnum block font-mono text-[12px] text-ink">
                          {p.seats} seat{p.seats === 1 ? '' : 's'}
                        </span>
                        <span className="tnum block font-mono text-[10.5px] text-verdant">
                          {rupees(p.estimated_saving)} saved
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Join / receipt */}
            {receipt ? (
              <section className="rounded-card border border-verdant/40 bg-verdant-soft p-4">
                <div className="flex items-center gap-2">
                  <StatusDot tone="verdant" />
                  <p className="micro text-verdant">pledge recorded</p>
                </div>
                <p className="font-display mt-2 text-[24px] leading-none font-medium text-ink">
                  {receipt.booking_ref}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
                  {receipt.seats} seat{receipt.seats === 1 ? '' : 's'} held for {receipt.passenger_name} on{' '}
                  {c.code}, boarding at {receipt.boarding_point}.
                </p>
                <div className="mt-3 border-t border-verdant/25 pt-3">
                  <KeyValue k="locked unit fare" v={rupees(receipt.locked_unit_fare)} mono />
                  <KeyValue
                    k={`platform fee (${c.platform_fee_pct}%)`}
                    v={rupees(receipt.platform_fee_unit)}
                    mono
                  />
                  <KeyValue
                    k="total authorised"
                    v={rupees(receipt.total_payable)}
                    mono
                    tone="text-verdant"
                  />
                  <KeyValue
                    k="status"
                    v={
                      receipt.status === 'allotment_confirmed'
                        ? 'allotment confirmed'
                        : 'escrow held — captures at tier lock'
                    }
                  />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                  {receiptNote}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={onClose}>
                    Back to the board
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReceipt(null);
                      setForm(EMPTY_FORM);
                      setSeats(1);
                    }}
                  >
                    Add another pledge
                  </Button>
                </div>
              </section>
            ) : (
              <section className="rounded-card border border-ink bg-paper-3 p-4">
                <p className="micro mb-3 text-ink-400">
                  {closed ? 'block full — join the waitlist' : 'join this cohort'}
                </p>

                {closed ? (
                  <p className="text-[12.5px] leading-relaxed text-ink-500">
                    Every seat in this contracted block is pledged. Waitlist seats are released if a
                    pledge is cancelled before the named-manifest deadline at T-72h. Request the same
                    corridor on the demand board and we will open a second block if the waitlist
                    clears 15 seats.
                  </p>
                ) : (
                  <form onSubmit={submit} className="space-y-3" noValidate>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Lead passenger" hint="as per government ID" error={errors.name}>
                        <TextInput
                          value={form.name}
                          onChange={(e) => update('name', e.target.value)}
                          placeholder="e.g. Pavan Dommeti"
                          invalid={Boolean(errors.name)}
                          autoComplete="name"
                        />
                      </Field>
                      <Field label="Mobile" hint="for manifest + boarding alerts" error={errors.phone}>
                        <TextInput
                          value={form.phone}
                          onChange={(e) => update('phone', e.target.value)}
                          placeholder="10-digit number"
                          inputMode="numeric"
                          invalid={Boolean(errors.phone)}
                          autoComplete="tel"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Cohort" hint="optional — how you travel">
                        <Select
                          value={form.cohort}
                          onChange={(e) => update('cohort', e.target.value)}
                        >
                          <option value="">General cohort</option>
                          <option value="Student wing (AP/Telangana)">Student wing (AP/Telangana)</option>
                          <option value="Delhi PSU / Central Govt families">
                            Delhi PSU / Central Govt families
                          </option>
                          <option value="HITEC City tech commuters">HITEC City tech commuters</option>
                          <option value="NRI / alumni chapter">NRI / alumni chapter</option>
                          <option value="Family group">Family group</option>
                        </Select>
                      </Field>
                      <Field label="Boarding / reporting point" error={errors.boardingPoint}>
                        <TextInput
                          value={form.boardingPoint}
                          onChange={(e) => update('boardingPoint', e.target.value)}
                          placeholder={c.pickup_hub}
                          invalid={Boolean(errors.boardingPoint)}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
                      <Field label="Seats" hint="1–8 per pledge" error={errors.seats}>
                        <div className="flex h-10 items-center gap-1 rounded-card border border-hairline bg-paper-3 px-1">
                          <StepperButton
                            label="Remove a seat"
                            disabled={seats <= 1}
                            onClick={() => setSeats((s) => Math.max(1, s - 1))}
                          >
                            −
                          </StepperButton>
                          <span className="tnum flex-1 text-center font-mono text-[15px] font-semibold text-ink">
                            {seats}
                          </span>
                          <StepperButton
                            label="Add a seat"
                            disabled={seats >= Math.min(8, remaining)}
                            onClick={() => setSeats((s) => Math.min(8, remaining, s + 1))}
                          >
                            +
                          </StepperButton>
                        </div>
                      </Field>

                      <div className="rounded-card border border-hairline bg-paper-2 px-3 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="micro text-ink-400">your landed fare</span>
                          <span className="tnum font-mono text-[16px] font-semibold text-ink">
                            {rupees(quote.landedPerSeat)}
                            <span className="text-[11px] font-normal text-ink-400"> / seat</span>
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11.5px] text-ink-500">
                          <span>
                            net group {rupees(quote.unitFare)} + fee {rupees(quote.feePerSeat)} (
                            {c.platform_fee_pct}%)
                          </span>
                          <span className="tnum font-mono text-verdant">
                            saves {rupees(quote.totalSaving)} on {seats} seat{seats === 1 ? '' : 's'}
                          </span>
                        </div>
                        {quote.seatsToNextTier > 0 ? (
                          <p className="tnum mt-1.5 border-t border-hairline-soft pt-1.5 text-[11px] text-marigold">
                            {quote.seatsToNextTier} more seat{quote.seatsToNextTier === 1 ? '' : 's'} in
                            this cohort unlocks the next slab — worth another{' '}
                            {rupees(quote.nextTierSaving)} to your pledge.
                          </p>
                        ) : (
                          <p className="mt-1.5 border-t border-hairline-soft pt-1.5 text-[11px] text-verdant">
                            Deepest contracted slab is live for this cohort.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-hairline pt-3">
                      <p className="max-w-sm text-[11px] leading-relaxed text-ink-400">
                        Authorisation only — funds sit in the escrow/nodal account until Tier I locks.
                        {source === 'snapshot'
                          ? ' Snapshot ledger: this browser cannot reach Postgres, so the pledge is simulated locally.'
                          : ''}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="tnum font-display text-[22px] leading-none font-medium text-ink">
                          {rupees(quote.total)}
                        </span>
                        <Button type="submit" variant="accent" loading={submitting}>
                          Hold {seats} seat{seats === 1 ? '' : 's'}
                        </Button>
                      </div>
                    </div>

                    {errors.form ? (
                      <p className="rounded-card border border-surge/40 bg-surge-soft px-3 py-2 text-[12px] font-medium text-surge">
                        {errors.form}
                      </p>
                    ) : null}
                  </form>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepperButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-[2px] border border-hairline text-[14px] leading-none text-ink-600 transition-colors hover:border-ink hover:text-ink disabled:opacity-35 disabled:hover:border-hairline"
    >
      {children}
    </button>
  );
}
