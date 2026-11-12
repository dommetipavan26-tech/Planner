import { useMemo, useState } from 'react';
import { compactRupees, number, pct, rupees } from '../lib/format';
import { UNIT_ECON_DEFAULTS } from '../data/review';
import { Panel, PanelHead } from './ui';

interface Inputs {
  seats: number;
  netFare: number;
  surgeFare: number;
  feePct: number;
  overridePct: number;
  mdrPct: number;
  opsPerSeat: number;
  fillRate: number;
}

const SLIDERS: {
  key: keyof Inputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
}[] = [
  {
    key: 'seats',
    label: 'Contracted block size',
    min: 15,
    max: 180,
    step: 1,
    format: (v) => `${v} seats`,
    hint: 'seats the carrier group desk commits per corridor',
  },
  {
    key: 'netFare',
    label: 'Net group fare',
    min: 2500,
    max: 20000,
    step: 50,
    format: (v) => rupees(v),
    hint: 'contracted wholesale fare per seat, before our fee',
  },
  {
    key: 'surgeFare',
    label: 'Festival retail fare',
    min: 3000,
    max: 30000,
    step: 50,
    format: (v) => rupees(v),
    hint: 'what the same seat costs on an OTA during the window',
  },
  {
    key: 'feePct',
    label: 'Platform fee',
    min: 0,
    max: 12,
    step: 0.5,
    format: (v) => pct(v, 1),
    hint: 'charged to the traveler, printed on the receipt',
  },
  {
    key: 'overridePct',
    label: 'Carrier override',
    min: 0,
    max: 8,
    step: 0.5,
    format: (v) => pct(v, 1),
    hint: 'B2B commission from the group desk on net fare',
  },
  {
    key: 'fillRate',
    label: 'Cohort fill rate',
    min: 30,
    max: 100,
    step: 1,
    format: (v) => pct(v),
    hint: 'share of the block that actually pledges',
  },
];

const TEAM_COST_CR = 1.2;

export function UnitEconomics() {
  const [inputs, setInputs] = useState<Inputs>({
    seats: UNIT_ECON_DEFAULTS.seats,
    netFare: UNIT_ECON_DEFAULTS.netFare,
    surgeFare: UNIT_ECON_DEFAULTS.surgeFare,
    feePct: UNIT_ECON_DEFAULTS.feePct,
    overridePct: UNIT_ECON_DEFAULTS.overridePct,
    mdrPct: UNIT_ECON_DEFAULTS.mdrPct,
    opsPerSeat: UNIT_ECON_DEFAULTS.opsPerSeat,
    fillRate: UNIT_ECON_DEFAULTS.fillRate * 100,
  });

  const [emdCommitSeats, setEmdCommitSeats] = useState(15);
  const [refundPerSeat, setRefundPerSeat] = useState(150);
  const [corridorsPerWindow, setCorridorsPerWindow] = useState(UNIT_ECON_DEFAULTS.corridorsPerWindow);
  const [windowsPerYear, setWindowsPerYear] = useState(UNIT_ECON_DEFAULTS.windowsPerYear);
  const [failureRate, setFailureRate] = useState(UNIT_ECON_DEFAULTS.failureRate * 100);

  const model = useMemo(() => {
    const feePerSeat = Math.round(inputs.netFare * (inputs.feePct / 100));
    const overridePerSeat = Math.round(inputs.netFare * (inputs.overridePct / 100));
    const landed = inputs.netFare + feePerSeat;
    const savingPerSeat = Math.max(0, inputs.surgeFare - landed);
    const mdrPerSeat = Math.round(landed * (inputs.mdrPct / 100));
    const revenuePerSeat = feePerSeat + overridePerSeat;
    const costPerSeat = mdrPerSeat + inputs.opsPerSeat;
    const contributionPerSeat = revenuePerSeat - costPerSeat;

    const seatsFilled = Math.round(inputs.seats * (inputs.fillRate / 100));
    const corridorGmv = seatsFilled * landed;
    const corridorContribution = seatsFilled * contributionPerSeat;
    const emdForfeit = 0.25 * inputs.netFare * emdCommitSeats;
    const refundOps = refundPerSeat * seatsFilled;
    const failureDrag = (failureRate / 100) * (emdForfeit + refundOps);
    const expectedPerCorridor = corridorContribution - failureDrag;

    const corridorsPerYear = corridorsPerWindow * windowsPerYear;
    const annualSeats = corridorsPerYear * seatsFilled;
    const annualGmv = corridorsPerYear * corridorGmv;
    const annualTravelerSavings = corridorsPerYear * seatsFilled * savingPerSeat;
    const annualContribution = corridorsPerYear * expectedPerCorridor;
    const takeRate = corridorGmv > 0 ? (corridorContribution / corridorGmv) * 100 : 0;
    const breakEvenSeats =
      contributionPerSeat > 0
        ? Math.ceil(failureDrag / (contributionPerSeat * (inputs.fillRate / 100)))
        : Number.POSITIVE_INFINITY;
    const teamCovered = annualContribution / (TEAM_COST_CR * 10_000_000);

    return {
      feePerSeat,
      overridePerSeat,
      landed,
      savingPerSeat,
      mdrPerSeat,
      revenuePerSeat,
      costPerSeat,
      contributionPerSeat,
      seatsFilled,
      corridorGmv,
      corridorContribution,
      emdForfeit,
      refundOps,
      failureDrag,
      expectedPerCorridor,
      corridorsPerYear,
      annualSeats,
      annualGmv,
      annualTravelerSavings,
      annualContribution,
      takeRate,
      breakEvenSeats,
      teamCovered,
      savingPct: inputs.surgeFare > 0 ? (savingPerSeat / inputs.surgeFare) * 100 : 0,
    };
  }, [inputs, emdCommitSeats, refundPerSeat, failureRate, corridorsPerWindow, windowsPerYear]);

  const set = (key: keyof Inputs, value: number) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const viable = model.expectedPerCorridor > 0 && model.contributionPerSeat > 0;

  return (
    <Panel>
      <PanelHead
        eyebrow="decision tool"
        title="Corridor unit economics"
        aside={
          <span className="micro text-ink-400">
            {viable ? 'contribution positive at these assumptions' : 'negative contribution — fix take rate or ops'}
          </span>
        }
      />

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Assumptions */}
        <div className="border-b border-hairline-soft p-4 sm:p-5 lg:border-r lg:border-b-0">
          <p className="micro mb-3 text-ink-400">assumptions</p>
          <div className="space-y-4">
            {SLIDERS.map((s) => (
              <div key={s.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={`ue-${s.key}`} className="text-[12.5px] font-medium text-ink">
                    {s.label}
                  </label>
                  <span className="tnum font-mono text-[12.5px] font-semibold text-marigold">
                    {s.format(inputs[s.key])}
                  </span>
                </div>
                <input
                  id={`ue-${s.key}`}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={inputs[s.key]}
                  onChange={(e) => set(s.key, Number(e.target.value))}
                  className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-hairline accent-marigold"
                />
                <p className="mt-1 text-[10.5px] leading-snug text-ink-400">{s.hint}</p>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 border-t border-hairline-soft pt-3">
              <NumberField
                label="EMD commitment"
                hint="seats"
                value={emdCommitSeats}
                onChange={setEmdCommitSeats}
                min={0}
                max={60}
              />
              <NumberField
                label="Refund ops"
                hint="₹ / seat"
                value={refundPerSeat}
                onChange={setRefundPerSeat}
                min={0}
                max={1000}
                step={10}
              />
              <NumberField
                label="Corridors"
                hint="per window"
                value={corridorsPerWindow}
                onChange={setCorridorsPerWindow}
                min={1}
                max={120}
              />
              <NumberField
                label="Windows"
                hint="per year"
                value={windowsPerYear}
                onChange={setWindowsPerYear}
                min={1}
                max={12}
              />
              <NumberField
                label="Payment MDR"
                hint="%"
                value={inputs.mdrPct}
                onChange={(v) => set('mdrPct', v)}
                min={0}
                max={4}
                step={0.1}
              />
              <NumberField
                label="Manifest ops"
                hint="₹ / seat"
                value={inputs.opsPerSeat}
                onChange={(v) => set('opsPerSeat', v)}
                min={0}
                max={500}
                step={5}
              />
              <NumberField
                label="Corridor failure"
                hint="% miss tier I"
                value={failureRate}
                onChange={setFailureRate}
                min={0}
                max={80}
                step={1}
              />
              <div className="flex items-end">
                <p className="text-[10.5px] leading-snug text-ink-400">
                  Failure forfeits the EMD on {emdCommitSeats} committed seats plus refund ops.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Output ledger */}
        <div className="p-4 sm:p-5">
          <p className="micro mb-3 text-ink-400">per seat</p>
          <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2">
            <OutCell label="landed fare" value={rupees(model.landed)} note={`net ${rupees(inputs.netFare)} + fee`} />
            <OutCell
              label="traveler saving"
              value={rupees(model.savingPerSeat)}
              note={`${pct(model.savingPct)} below festival retail`}
              tone="verdant"
            />
            <OutCell
              label="platform take"
              value={rupees(model.revenuePerSeat)}
              note={`fee ${rupees(model.feePerSeat)} + override ${rupees(model.overridePerSeat)}`}
            />
            <OutCell
              label="contribution"
              value={rupees(model.contributionPerSeat)}
              note={`less MDR ${rupees(model.mdrPerSeat)} + ops ${rupees(inputs.opsPerSeat)}`}
              tone={model.contributionPerSeat > 0 ? 'verdant' : 'surge'}
            />
          </div>

          <p className="micro mt-5 mb-3 text-ink-400">per corridor</p>
          <dl className="divide-y divide-hairline-soft border-y border-hairline-soft">
            <Row k="seats filled" v={`${model.seatsFilled} of ${inputs.seats}`} />
            <Row k="cohort gmv" v={compactRupees(model.corridorGmv)} />
            <Row k="gross contribution" v={compactRupees(model.corridorContribution)} />
            <Row
              k="expected failure drag"
              v={`−${compactRupees(model.failureDrag)}`}
              tone="surge"
            />
            <Row
              k="expected contribution"
              v={compactRupees(model.expectedPerCorridor)}
              tone={model.expectedPerCorridor > 0 ? 'verdant' : 'surge'}
              strong
            />
            <Row
              k="break-even cohort"
              v={
                Number.isFinite(model.breakEvenSeats)
                  ? `${number(model.breakEvenSeats)} seats`
                  : 'unreachable'
              }
            />
            <Row k="effective take rate" v={pct(model.takeRate, 1)} />
          </dl>

          <p className="micro mt-5 mb-3 text-ink-400">
            per year · {model.corridorsPerYear} corridors
          </p>
          <div className="grid gap-px overflow-hidden rounded-card border border-ink bg-ink sm:grid-cols-2">
            <OutCell
              dark
              label="annual gmv"
              value={compactRupees(model.annualGmv)}
              note={`${number(model.annualSeats)} traveler seats`}
            />
            <OutCell
              dark
              label="traveler savings created"
              value={compactRupees(model.annualTravelerSavings)}
              note="the value you actually deliver"
            />
            <OutCell
              dark
              label="annual contribution"
              value={compactRupees(model.annualContribution)}
              note="after failure drag, MDR and ops"
              tone={model.annualContribution > 0 ? 'mint' : 'rose'}
            />
            <OutCell
              dark
              label="team it can pay for"
              value={`${model.teamCovered.toFixed(1)}×`}
              note={`of a ₹${TEAM_COST_CR} Cr / yr six-person team`}
              tone={model.teamCovered >= 1 ? 'mint' : 'rose'}
            />
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink-500">
            Read this as the whole argument in one line: at a {pct(inputs.feePct, 1)} traveler fee and{' '}
            {pct(inputs.overridePct, 1)} carrier override, {model.seatsFilled} filled seats produce{' '}
            {compactRupees(model.expectedPerCorridor)} of expected contribution per corridor. Change the
            fee, the override or the failure rate and watch how fast that number crosses zero — that
            crossing is the business.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function OutCell({
  label,
  value,
  note,
  tone = 'ink',
  dark = false,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'ink' | 'verdant' | 'surge' | 'mint' | 'rose';
  dark?: boolean;
}) {
  const tones: Record<string, string> = {
    ink: dark ? 'text-paper' : 'text-ink',
    verdant: 'text-verdant',
    surge: 'text-surge',
    mint: 'text-[#8fd6b0]',
    rose: 'text-[#f0a49a]',
  };
  return (
    <div className={dark ? 'bg-ink px-3 py-2.5' : 'bg-paper-3 px-3 py-2.5'}>
      <p className={`micro ${dark ? 'text-ink-400' : 'text-ink-400'}`}>{label}</p>
      <p className={`tnum font-display mt-1 text-[19px] leading-none font-medium ${tones[tone]}`}>
        {value}
      </p>
      <p className={`mt-1 text-[10.5px] leading-snug ${dark ? 'text-ink-400' : 'text-ink-400'}`}>
        {note}
      </p>
    </div>
  );
}

function Row({
  k,
  v,
  tone,
  strong = false,
}: {
  k: string;
  v: string;
  tone?: 'verdant' | 'surge';
  strong?: boolean;
}) {
  const tones = { verdant: 'text-verdant', surge: 'text-surge' } as const;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="micro text-ink-400">{k}</dt>
      <dd
        className={`tnum font-mono ${strong ? 'text-[13.5px] font-semibold' : 'text-[12.5px]'} ${
          tone ? tones[tone] : 'text-ink'
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="micro mb-1 block text-ink-400">
        {label} <span className="normal-case tracking-normal text-ink-300">· {hint}</span>
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tnum h-9 w-full rounded-card border border-hairline bg-paper-3 px-2.5 font-mono text-[12.5px] text-ink focus:border-marigold focus:outline-none"
      />
    </label>
  );
}
