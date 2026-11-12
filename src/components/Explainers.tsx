import { useMemo, type ReactNode } from 'react';
import { Link, corridorPath } from '../lib/router';
import {
  feeOn,
  landedPerSeat,
  pct,
  rupees,
  savingPct,
  savingPerSeat,
  surgeMultiple,
} from '../lib/format';
import type { Corridor } from '../lib/types';
import { Chip, Divider, Eyebrow, Reveal, cn } from './ui';
import { IconArrow, IconCheck, IconHandshake, IconShield, IconUsers } from './icons';

/** Section wrapper: consistent rhythm, an id for the footer links, an eyebrow. */
export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  className,
  aside,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section id={id} className={cn('scroll-mt-24', className)}>
      <div className="flex flex-col gap-4 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className="display text-[clamp(1.75rem,3.6vw,2.5rem)] text-ivory">{title}</h2>
          {lede ? <p className="text-[13.5px] leading-relaxed text-mist-dim">{lede}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="pt-6">{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- mechanics */

const STEPS = [
  {
    n: '01',
    title: 'A carrier contracts a block',
    body: 'We negotiate a fixed seat allotment for one festival departure — 42 berths on a coach, 60 seats in an aircraft cabin — at a rate the carrier will only honour at volume. The contract reference, the hold window and the baggage terms are published on the corridor.',
    icon: IconHandshake,
  },
  {
    n: '02',
    title: 'Travellers pledge into it',
    body: 'A pledge reserves your seat in the cohort and records the most you were willing to pay. It costs nothing today: no card is charged, no ticket is issued, and names can be swapped free until 72 hours before departure.',
    icon: IconUsers,
  },
  {
    n: '03',
    title: 'The slab reprices everyone',
    body: 'The instant the cohort crosses a threshold, the contracted rate for that slab applies to every pledged seat — including the ones that joined first. That is the whole trick: the discount is a property of the group, not of who booked earliest.',
    icon: IconCheck,
  },
] as const;

export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="Mechanics"
      title="Three steps, and one of them is free"
      lede="This is not a queue and not a lottery. It is a volume commitment split across the people who need it, with the price break written into the carrier contract."
    >
      <ol className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal
            key={step.n}
            as="li"
            delay={i * 70}
            className="flex h-full flex-col gap-3 bg-night-900 px-5 py-6"
          >
            <div className="flex items-center justify-between">
              <span className="tnum display text-[26px] leading-none text-mist-faint">{step.n}</span>
              <step.icon size={17} className="text-marigold" />
            </div>
            <h3 className="display text-[20px] leading-tight text-ivory">{step.title}</h3>
            <p className="text-[12.5px] leading-relaxed text-mist-dim">{step.body}</p>
          </Reveal>
        ))}
      </ol>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-mist-faint">
        <span className="inline-flex items-center gap-1.5">
          <IconShield size={13} className="text-jade" />
          Pledges are released automatically if the block never confirms
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IconCheck size={13} className="text-jade" />
          Seat counts, thresholds and fees update live from Postgres
        </span>
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ slabs */

export function TierExplainer({ corridor }: { corridor: Corridor | undefined }) {
  const c = corridor;
  const rows = useMemo(() => {
    if (!c) return [];
    return [
      { label: 'Tier I', min: c.tier1_min, net: c.tier1_fare },
      { label: 'Tier II', min: c.tier2_min, net: c.tier2_fare },
      { label: 'Tier III', min: c.tier3_min, net: c.tier3_fare },
    ].map((r) => {
      const fee = feeOn(r.net, c.platform_fee_pct);
      return {
        ...r,
        fee,
        landed: r.net + fee,
        saving: Math.max(0, c.festival_surge_fare - (r.net + fee)),
      };
    });
  }, [c]);

  if (!c) return null;

  return (
    <Section
      id="tiers"
      eyebrow="Tier slabs"
      title="The price is a function of the group"
      lede={`Worked on ${c.code} — ${c.origin_city} to ${c.dest_city}, ${c.service_number}. Surge on a public engine is ${rupees(c.festival_surge_fare)}; the contracted slabs below are what the carrier actually accepts.`}
      aside={
        <Link
          to={corridorPath(c.code)}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-[12.5px] text-mist transition-colors duration-200 hover:border-marigold/50 hover:text-marigold"
        >
          Open {c.code} <IconArrow size={12} />
        </Link>
      }
    >
      <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-[1.1fr_1fr]">
        <div className="bg-night-900 p-5">
          <table className="w-full border-collapse">
            <caption className="sr-only">Tier slabs for {c.code}</caption>
            <thead>
              <tr className="micro text-mist-faint">
                <th scope="col" className="pb-2.5 text-left font-medium">Slab</th>
                <th scope="col" className="pb-2.5 text-right font-medium">Seats</th>
                <th scope="col" className="pb-2.5 text-right font-medium">Net</th>
                <th scope="col" className="pb-2.5 text-right font-medium">
                  Fee {pct(c.platform_fee_pct, 1)}
                </th>
                <th scope="col" className="pb-2.5 text-right font-medium">Landed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={cn('border-t border-line-soft', i === 0 && 'border-t-0')}>
                  <th scope="row" className="py-2.5 text-left text-[12.5px] font-normal text-ivory">
                    {r.label}
                  </th>
                  <td className="tnum py-2.5 text-right text-[12.5px] text-mist-dim">{r.min}+</td>
                  <td className="tnum py-2.5 text-right text-[12.5px] text-mist">{rupees(r.net)}</td>
                  <td className="tnum py-2.5 text-right text-[12.5px] text-clay">{rupees(r.fee)}</td>
                  <td className="tnum py-2.5 text-right text-[13.5px] font-medium text-ivory">
                    {rupees(r.landed)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line-soft">
                <th scope="row" className="py-2.5 text-left text-[12.5px] font-normal text-mist-faint">
                  Public surge
                </th>
                <td className="py-2.5 text-right text-[12.5px] text-mist-faint">1</td>
                <td className="py-2.5" colSpan={2} />
                <td className="tnum py-2.5 text-right text-[13.5px] text-ember line-through">
                  {rupees(c.festival_surge_fare)}
                </td>
              </tr>
            </tbody>
          </table>
          <Divider className="my-4" />
          <p className="text-[11.5px] leading-relaxed text-mist-faint">
            Slabs are contractual minimums, not targets: at {c.pledged_seats} pledged seats the
            corridor is priced at{' '}
            <span className="tnum text-mist">{rupees(landedPerSeat(c))}</span> landed, a{' '}
            <span className="tnum text-jade">{pct(savingPct(c))}</span>{' '}
            reduction against the surge fare.
          </p>
        </div>

        <div className="flex flex-col justify-between gap-5 bg-night-850 p-5">
          <div className="flex flex-col gap-3">
            <Eyebrow>Why a group beats a queue</Eyebrow>
            <p className="text-[12.5px] leading-relaxed text-mist">
              Airline and coach revenue management sells the last few seats at a premium because they
              are scarce. A block sold 60 days out is the opposite: guaranteed load factor, one
              manifest, one settlement. Carriers price that certainty, and this desk passes the whole
              break through to the cohort rather than keeping the spread.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Surge multiple"
              value={`${surgeMultiple(c).toFixed(1)}×`}
              tone="ember"
              note="festival vs off-season"
            />
            <MiniStat
              label="Saving per seat"
              value={rupees(savingPerSeat(c))}
              tone="jade"
              note={`at ${c.pledged_seats} pledged`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {c.amenities.slice(0, 4).map((a) => (
              <Chip key={a} tone="neutral">
                {a}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function MiniStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: 'jade' | 'ember' | 'marigold';
}) {
  const colour = tone === 'jade' ? 'text-jade' : tone === 'ember' ? 'text-ember' : 'text-marigold';
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-night-900 px-3 py-2.5">
      <span className="micro text-mist-faint">{label}</span>
      <span className={cn('tnum text-[19px] leading-none font-medium', colour)}>{value}</span>
      <span className="text-[10.5px] text-mist-faint">{note}</span>
    </div>
  );
}

/* -------------------------------------------------------------------- fee */

export function FeeDisclosure({ corridor }: { corridor: Corridor | undefined }) {
  const c = corridor;

  const example = useMemo(() => {
    if (!c) return null;
    const net = c.tier3_fare;
    const platform = feeOn(net, c.platform_fee_pct);
    const landed = net + platform;
    const seats = c.tier3_min;
    return {
      net,
      platform,
      landed,
      seats,
      gross: landed * seats,
      fees: platform * seats,
      surge: c.festival_surge_fare * seats,
      saved: Math.max(0, (c.festival_surge_fare - landed) * seats),
      perSeatFee: platform,
    };
  }, [c]);

  if (!c || !example) return null;

  const allocation = [
    { label: 'Carrier settlement & escrow handling', share: 46 },
    { label: 'Ground marshals at boarding points', share: 24 },
    { label: 'Manifest, name-swap and refund desk', share: 18 },
    { label: 'Payment gateway & compliance', share: 12 },
  ];

  return (
    <Section
      id="fee"
      eyebrow="Fee disclosure"
      title="One fee, stated on every figure"
      lede={`UtsavAir charges ${pct(c.platform_fee_pct, 1)} of the carrier net fare. It is never hidden in the fare, never a percentage of your saving, and never charged before the block confirms.`}
    >
      <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-4 bg-night-900 p-5">
          <Eyebrow>Worked example · {c.code} at full slab</Eyebrow>
          <dl className="flex flex-col gap-2">
            <Line label={`Carrier net fare (Tier III, ${example.seats}+ seats)`} value={rupees(example.net)} />
            <Line
              label={`Platform fee ${pct(c.platform_fee_pct, 1)}`}
              value={rupees(example.platform)}
              tone="clay"
            />
            <Line label="Landed cost per seat" value={rupees(example.landed)} strong />
            <Divider className="my-1" />
            <Line label={`Cohort total at ${example.seats} seats`} value={rupees(example.gross)} />
            <Line label="Fee retained by UtsavAir" value={rupees(example.fees)} tone="clay" />
            <Line
              label={`Same ${example.seats} seats on a public engine`}
              value={rupees(example.surge)}
              strike
            />
            <Line label="Cohort saving" value={rupees(example.saved)} tone="jade" strong />
          </dl>
          <p className="text-[11.5px] leading-relaxed text-mist-faint">
            That is {rupees(example.perSeatFee)} per seat of platform revenue against a{' '}
            {rupees(example.saved / example.seats)} per-seat saving for the traveller. Where the fee
            cannot carry the corridor — long-haul air with thin slabs — the desk runs it at cost and
            says so.
          </p>
        </div>

        <div className="flex flex-col gap-4 bg-night-850 p-5">
          <Eyebrow>What the fee pays for · indicative allocation</Eyebrow>
          <ul className="flex flex-col gap-3">
            {allocation.map((row) => (
              <li key={row.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-mist">{row.label}</span>
                  <span className="tnum micro text-mist-dim">{row.share}%</span>
                </div>
                <span className="h-[3px] w-full overflow-hidden rounded-pill bg-night-750">
                  <span
                    className="block h-full rounded-pill bg-marigold/80"
                    style={{ width: `${row.share}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <Divider className="my-1" />
          <div className="flex flex-col gap-2 text-[11.5px] leading-relaxed text-mist-faint">
            <p>
              <span className="text-mist">Not included:</span> airport or operator levies that the
              carrier passes through at cost, and any optional add-ons (extra baggage, meals beyond
              the contracted allowance). Those appear separately on the manifest, never folded into
              the slab price.
            </p>
            <p>
              <span className="text-mist">Escrow:</span> pledges are held, not captured. Money moves
              only after the corridor clears Tier I and the carrier has confirmed the allotment in
              writing.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Line({
  label,
  value,
  tone,
  strong,
  strike,
}: {
  label: string;
  value: string;
  tone?: 'jade' | 'clay';
  strong?: boolean;
  strike?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn('text-[12.5px]', strong ? 'text-ivory' : 'text-mist-dim')}>{label}</dt>
      <dd
        className={cn(
          'tnum shrink-0',
          strong ? 'text-[15px] font-medium' : 'text-[13px]',
          tone === 'jade' ? 'text-jade' : tone === 'clay' ? 'text-clay' : 'text-ivory',
          strike && 'text-mist-faint line-through',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ----------------------------------------------------------------- refund */

export function RefundRule({ corridor }: { corridor: Corridor | undefined }) {
  const items = [
    {
      title: 'Block never confirms',
      body: 'If the cohort does not reach Tier I by the published lock deadline, every pledge is released automatically. Nothing was ever captured, so there is nothing to refund — the ledger marks the row released and the carrier returns the allotment.',
      tone: 'jade' as const,
    },
    {
      title: 'You change your mind before the manifest',
      body: 'Name swaps are free until 72 hours before departure on air corridors and 6 hours on coach corridors. Swap the seat to a relative, a classmate, anyone — the cohort stays whole and the slab price is unaffected.',
      tone: 'marigold' as const,
    },
    {
      title: 'You cancel after the manifest closes',
      body: 'From manifest submission the carrier’s own group cancellation rules apply, and they are the binding ones. This desk passes them through verbatim on each corridor rather than inventing a friendlier policy it cannot honour.',
      tone: 'clay' as const,
    },
    {
      title: 'The carrier pulls the block',
      body: 'Rare, and it happens: an aircraft swap or a schedule change can withdraw an allotment. In that case every pledge on the corridor is released in full and the corridor is closed on the board with a note explaining why.',
      tone: 'ember' as const,
    },
  ];

  return (
    <Section
      id="refund"
      eyebrow="Refund & release"
      title="What happens when it does not work out"
      lede="Four outcomes, stated plainly. The corridor you are looking at carries its own rule verbatim from the carrier contract."
      aside={
        corridor ? (
          <div className="max-w-sm rounded-card border border-line bg-night-900 px-4 py-3">
            <Eyebrow>{corridor.code} · contracted rule</Eyebrow>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{corridor.refund_rule}</p>
            <p className="mt-2 text-[11px] text-mist-faint">
              Contract {corridor.contract_ref} · hold window published per corridor
            </p>
          </div>
        ) : null
      }
    >
      <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
        {items.map((item, i) => (
          <Reveal key={item.title} delay={i * 60}>
            <div className="flex h-full flex-col gap-2 bg-night-900 px-5 py-5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    item.tone === 'jade'
                      ? 'bg-jade'
                      : item.tone === 'marigold'
                        ? 'bg-marigold'
                        : item.tone === 'clay'
                          ? 'bg-clay'
                          : 'bg-ember',
                  )}
                  aria-hidden="true"
                />
                <h3 className="text-[13.5px] font-medium text-ivory">{item.title}</h3>
              </div>
              <p className="text-[12.5px] leading-relaxed text-mist-dim">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-mist-faint">
        Large totals are written in Indian numbering — lakh and crore. Every rupee amount is a
        per-seat value unless the row says otherwise, and every percentage is stated against the
        figure it was computed from.
      </p>
    </Section>
  );
}
