import { useMemo, useState } from 'react';
import { Link, corridorPath } from '../lib/router';
import { useNow } from '../hooks/useClock';
import type { Ledger, RequestInput } from '../hooks/useLedger';
import { number, pluralise, relativeTime, rupees } from '../lib/format';
import type { Corridor, TravelMode } from '../lib/types';
import {
  Button,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  Panel,
  Reveal,
  Segmented,
  SelectInput,
  TextInput,
  cn,
} from '../components/ui';
import {
  IconArrow,
  IconBus,
  IconCheck,
  IconClock,
  IconPin,
  IconPlane,
  IconSearch,
  IconUsers,
} from '../components/icons';

const FESTIVALS = [
  'Sankranti 2027',
  'Ugadi 2027',
  'Kartika Purnima · winter wedding peak',
  'Dasara 2027',
  'Summer vacation peak 2027',
  'Other / flexible',
];

const CITY_HINTS = [
  'Vijayawada (Amaravati)',
  'Visakhapatnam',
  'Tirupati',
  'Rajahmundry',
  'Guntur / Amaravati',
  'New Delhi',
  'Bengaluru (Silk Board)',
  'Hyderabad (Gachibowli)',
  'Chennai (Kilambakkam)',
  'Pune (Hinjewadi)',
  'Mumbai (Vashi)',
];

interface FormErrors {
  originCity?: string;
  destCity?: string;
  travelWindow?: string;
  requesterName?: string;
  groupSize?: string;
}

export function RequestsView({
  ledger,
  onToast,
  onHold,
}: {
  ledger: Ledger;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onHold: (corridor: Corridor) => void;
}) {
  const now = useNow();
  const { requests, corridors, upvote } = ledger;

  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | TravelMode>('all');
  const [voting, setVoting] = useState<string | null>(null);

  const [originCity, setOriginCity] = useState('');
  const [destCity, setDestCity] = useState('');
  const [festival, setFestival] = useState(FESTIVALS[0] ?? 'Sankranti 2027');
  const [mode, setMode] = useState<TravelMode>('bus');
  const [travelWindow, setTravelWindow] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [groupSize, setGroupSize] = useState(12);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const stats = useMemo(() => {
    const seats = requests.reduce((sum, r) => sum + r.group_size, 0);
    const votes = requests.reduce((sum, r) => sum + r.upvotes, 0);
    const pairs = new Map<string, number>();
    for (const r of requests) {
      const key = `${r.origin_city} → ${r.dest_city}`;
      pairs.set(key, (pairs.get(key) ?? 0) + r.upvotes + r.group_size);
    }
    const top = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
    return { seats, votes, top: top?.[0] ?? '—', pairs: pairs.size };
  }, [requests]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests
      .filter((r) => (modeFilter === 'all' ? true : r.mode === modeFilter))
      .filter((r) =>
        q
          ? r.origin_city.toLowerCase().includes(q) ||
            r.dest_city.toLowerCase().includes(q) ||
            r.requester_name.toLowerCase().includes(q) ||
            r.festival.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.upvotes - a.upvotes || b.group_size - a.group_size);
  }, [requests, query, modeFilter]);

  const matches = useMemo(() => {
    if (corridors.length === 0) return [];
    const q = `${originCity} ${destCity}`.trim().toLowerCase();
    if (q.length < 4) return [];
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);
    return corridors
      .filter((c) => {
        const hay = `${c.origin_city} ${c.dest_city} ${c.origin_code} ${c.dest_code}`.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      })
      .slice(0, 3);
  }, [corridors, originCity, destCity]);

  const validate = (): FormErrors => {
    const found: FormErrors = {};
    if (originCity.trim().length < 3) found.originCity = 'Which city does the group leave from?';
    if (destCity.trim().length < 3) found.destCity = 'Where is the group going?';
    if (travelWindow.trim().length < 4)
      found.travelWindow = 'A date or window, e.g. “12 Jan 2027 · night”.';
    if (requesterName.trim().length < 3)
      found.requesterName = 'A name or the group’s name, so the desk can reply.';
    if (!Number.isFinite(groupSize) || groupSize < 5 || groupSize > 200)
      found.groupSize = 'Group size between 5 and 200 travellers.';
    if (originCity.trim() && destCity.trim() && originCity.trim() === destCity.trim())
      found.destCity = 'Origin and destination are the same city.';
    return found;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    const firstInvalid = (
      [
        ['originCity', 'req-origin'],
        ['destCity', 'req-dest'],
        ['travelWindow', 'req-window'],
        ['requesterName', 'req-name'],
        ['groupSize', 'req-size'],
      ] as const
    ).find(([key]) => found[key]);
    if (firstInvalid) {
      document.getElementById(firstInvalid[1])?.focus();
      return;
    }

    const payload: RequestInput = {
      originCity,
      destCity,
      festival,
      mode,
      travelWindow,
      requesterName,
      groupSize: Math.round(groupSize),
    };
    setSubmitting(true);
    const result = await ledger.submitRequest(payload);
    setSubmitting(false);
    if (result.ok) {
      setOriginCity('');
      setDestCity('');
      setTravelWindow('');
      setRequesterName('');
      setErrors({});
      if (result.simulated) {
        onToast('Request kept on this device only — it did not reach Postgres', 'info');
      } else if (result.duplicate) {
        // The ledger treats the same ask from the same device inside two minutes as
        // a retry and hands back the row it already wrote.
        onToast('This device already posted that request', 'info');
      } else {
        onToast('Request published to the corridor board', 'success');
      }
    } else {
      onToast(result.error ?? 'The ledger rejected that request.', result.throttled ? 'info' : 'error');
    }
  };

  const vote = async (id: string) => {
    setVoting(id);
    const result = await upvote(id);
    setVoting(null);
    if (!result.ok) {
      onToast(result.error ?? 'Could not register that upvote.', result.throttled ? 'info' : 'error');
      return;
    }
    if (result.duplicate) {
      // One vote per request per device. A second press is a no-op, and saying
      // nothing about it would just look like a dead button.
      onToast('This device already asked for that corridor', 'info');
      return;
    }
    if (result.simulated) {
      onToast('Upvote kept on this device only — it did not reach Postgres', 'info');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:py-14">
      <header className="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-2.5">
          <Eyebrow>Demand side · the board is built from this</Eyebrow>
          <h1 className="display text-[clamp(2rem,4.6vw,3.25rem)] text-ivory">Corridor requests</h1>
          <p className="text-[13.5px] leading-relaxed text-mist-dim">
            If your route is not on the board, ask for it. A request carries the group size behind it,
            and group size is exactly what a carrier desk needs before it will release an allotment.
            Requests are public, upvotable, and answered either way.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line">
          <MiniStat label="Requests" value={String(requests.length)} />
          <MiniStat label="Group seats" value={number(stats.seats)} />
          <MiniStat label="Upvotes" value={number(stats.votes)} />
        </dl>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              label="Filter by mode"
              value={modeFilter}
              onChange={setModeFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'flight', label: 'Air' },
                { value: 'bus', label: 'Coach' },
              ]}
            />
            <div className="relative w-full sm:w-64">
              <IconSearch
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-faint"
              />
              <TextInput
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="City, festival or group"
                aria-label="Search corridor requests"
                className="pl-9"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconSearch size={22} />}
              as="h2"
              title="No request matches that"
              body="Nothing on the board for that city pair or festival yet — which is precisely the gap a request fills. File one and other groups on the same route can add their weight to it."
              action={
                query || modeFilter !== 'all' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setQuery('');
                      setModeFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex list-none flex-col gap-3">
              {filtered.map((request, i) => (
                <Reveal key={request.id} as="li" delay={Math.min(i, 5) * 40}>
                  <Panel hover className="flex gap-4 p-4">
                    <button
                      type="button"
                      onClick={() => void vote(request.id)}
                      disabled={voting === request.id}
                      aria-label={`Upvote the ${request.origin_city} to ${request.dest_city} request, currently ${request.upvotes} votes`}
                      className={cn(
                        'flex h-full min-h-[4.5rem] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-card border transition-colors duration-200',
                        voting === request.id
                          ? 'border-marigold/60 bg-marigold-veil text-marigold'
                          : 'border-line bg-night-850 text-mist-dim hover:border-marigold/50 hover:bg-marigold-veil hover:text-marigold',
                      )}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 5.5 18.5 12H15v6.5H9V12H5.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="tnum text-[15px] font-medium leading-none text-ivory">
                        {request.upvotes}
                      </span>
                      <span className="micro text-[9px] text-mist-faint">votes</span>
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2 text-[14px] text-ivory">
                            {request.origin_city}
                            <IconArrow size={13} className="shrink-0 text-mist-faint" />
                            {request.dest_city}
                          </span>
                          <span className="text-[11.5px] text-mist-dim">{request.travel_window}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Chip tone={request.mode === 'bus' ? 'lagoon' : 'marigold'}>
                            {request.mode === 'bus' ? 'coach' : 'air'}
                          </Chip>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-mist-faint">
                        <span className="inline-flex items-center gap-1.5">
                          <IconClock size={12} />
                          {request.festival}
                        </span>
                        <span className="tnum inline-flex items-center gap-1.5">
                          <IconUsers size={12} />
                          {pluralise(request.group_size, 'traveller')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <IconPin size={12} />
                          {request.requester_name}
                        </span>
                        <span className="tnum ml-auto">{relativeTime(request.created_at, now)}</span>
                      </div>

                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
                        <span className="micro text-mist-faint">
                          {request.upvotes >= 12 || request.group_size >= 20
                            ? 'contracting threshold met'
                            : `${Math.max(0, 12 - request.upvotes)} more votes to threshold`}
                        </span>
                        {request.upvotes >= 12 || request.group_size >= 20 ? (
                          <Chip tone="jade" dot>
                            desk engaged
                          </Chip>
                        ) : null}
                      </div>
                    </div>
                  </Panel>
                </Reveal>
              ))}
            </ul>
          )}

          <section className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 border-b border-line pb-3">
              <Eyebrow>How a request becomes a corridor</Eyebrow>
              <h2 className="display text-[clamp(1.5rem,3vw,2rem)] text-ivory">
                Three triggers, one honest answer
              </h2>
            </div>
            <ol className="grid list-none gap-3 sm:grid-cols-3">
              {[
                {
                  n: '01',
                  title: '12 upvotes',
                  body: 'Twelve independent travellers on the same city pair and window is enough for the desk to open a conversation with a carrier.',
                },
                {
                  n: '02',
                  title: 'One group of 20+',
                  body: 'A single association, hostel wing or company group of twenty or more can trigger a block on its own — that is already a viable allotment.',
                },
                {
                  n: '03',
                  title: 'Spare allotment exists',
                  body: 'If a carrier already has uncommitted group inventory on the route for that window, we contract it even with a thin request list.',
                },
              ].map((item) => (
                <li
                  key={item.n}
                  className="flex flex-col gap-2 rounded-card border border-line bg-night-900 px-4 py-4"
                >
                  <span className="tnum display text-[22px] leading-none text-mist-faint">
                    {item.n}
                  </span>
                  <span className="text-[13px] text-ivory">{item.title}</span>
                  <span className="text-[12px] leading-relaxed text-mist-dim">{item.body}</span>
                </li>
              ))}
            </ol>
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-mist-faint">
              <IconCheck size={13} className="mt-px shrink-0 text-jade" />
              Every request gets an answer, including the refusals. If a corridor cannot be contracted —
              no carrier with spare allotment, or a window inside a schedule freeze — the request is
              closed with the reason recorded on it rather than left to decay on a list.
            </p>
          </section>
        </div>

        {/* Request form */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <Eyebrow>File a request</Eyebrow>
              <h2 className="display text-[21px] leading-tight text-ivory">
                Put your group on the board
              </h2>
              <p className="text-[11.5px] leading-relaxed text-mist-dim">
                Published with your group name and size. No contact details are stored beyond what you
                type here.
              </p>
            </div>

            <form
              className="flex flex-col gap-3.5"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label="Leaving from" htmlFor="req-origin" required error={errors.originCity}>
                <TextInput
                  id="req-origin"
                  list="utsav-cities"
                  value={originCity}
                  placeholder="Vijayawada (Amaravati)"
                  invalid={Boolean(errors.originCity)}
                  onChange={(e) => setOriginCity(e.target.value)}
                />
              </Field>
              <datalist id="utsav-cities">
                {CITY_HINTS.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>

              <Field label="Going to" htmlFor="req-dest" required error={errors.destCity}>
                <TextInput
                  id="req-dest"
                  list="utsav-cities"
                  value={destCity}
                  placeholder="New Delhi"
                  invalid={Boolean(errors.destCity)}
                  onChange={(e) => setDestCity(e.target.value)}
                />
              </Field>

              {matches.length > 0 ? (
                <div className="rounded-card border border-jade/30 bg-jade-veil px-3 py-2.5">
                  <p className="micro text-jade">already on the board</p>
                  <ul className="mt-2 flex list-none flex-col gap-1.5">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={corridorPath(c.code)}
                          className="flex items-center justify-between gap-2 text-[11.5px] text-mist transition-colors duration-200 hover:text-ivory"
                        >
                          <span className="truncate">
                            {c.origin_code}→{c.dest_code} · {c.departure_date}
                          </span>
                          <span className="tnum shrink-0 text-marigold">
                            {rupees(c.tier1_fare)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => matches[0] && onHold(matches[0])}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-jade underline-offset-2 hover:underline"
                  >
                    Hold seats on {matches[0]?.code} instead <IconArrow size={11} />
                  </button>
                </div>
              ) : null}

              <Field label="Festival or window" htmlFor="req-festival">
                <SelectInput
                  id="req-festival"
                  value={festival}
                  onChange={(e) => setFestival(e.target.value)}
                >
                  {FESTIVALS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Travel window" htmlFor="req-window" required error={errors.travelWindow}>
                <TextInput
                  id="req-window"
                  value={travelWindow}
                  placeholder="12 Jan 2027 · night departure"
                  invalid={Boolean(errors.travelWindow)}
                  onChange={(e) => setTravelWindow(e.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="micro text-mist-dim">Preferred mode</span>
                <Segmented
                  label="Preferred travel mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'bus', label: 'Coach', icon: <IconBus size={13} /> },
                    { value: 'flight', label: 'Air', icon: <IconPlane size={13} /> },
                  ]}
                />
              </div>

              <Divider />

              <Field label="Your name or group" htmlFor="req-name" required error={errors.requesterName}>
                <TextInput
                  id="req-name"
                  value={requesterName}
                  placeholder="OMR IT Telugu Sangham"
                  invalid={Boolean(errors.requesterName)}
                  onChange={(e) => setRequesterName(e.target.value)}
                />
              </Field>

              <Field
                label="Group size"
                htmlFor="req-size"
                required
                error={errors.groupSize}
                hint="travellers, not seats"
              >
                <TextInput
                  id="req-size"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={200}
                  value={Number.isFinite(groupSize) ? groupSize : ''}
                  className="tnum"
                  invalid={Boolean(errors.groupSize)}
                  onChange={(e) => setGroupSize(Number(e.target.value))}
                />
              </Field>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                full
                loading={submitting}
                icon={<IconArrow size={14} />}
              >
                Publish request
              </Button>
              <p className="text-[11px] leading-snug text-mist-faint">
                Written to <span className="font-mono">utsav_corridor_requests</span> with one upvote
                from you already counted. The desk reviews new rows daily during a festival window.
              </p>
            </form>

            <Divider label="most requested" />
            <p className="text-[12px] text-mist">
              {stats.top}
              <span className="mt-1 block text-[11px] text-mist-faint">
                {stats.pairs} distinct city pairs requested
              </span>
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-night-900 px-4 py-3">
      <dt className="micro text-mist-faint">{label}</dt>
      <dd className="tnum text-[19px] leading-none font-medium text-ivory">{value}</dd>
    </div>
  );
}
