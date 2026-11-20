import { useMemo, useState } from 'react';
import { Link, corridorPath } from '../lib/router';
import { useNow } from '../hooks/useClock';
import type { Ledger, RequestInput } from '../hooks/useLedger';
import { number, pluralise, relativeTime, rupees } from '../lib/format';
import type { Corridor, TravelMode } from '../lib/types';
import {
  Button,
  Chip,
  Disclosure,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  FormAlert,
  FormSection,
  Panel,
  Reveal,
  Segmented,
  SelectInput,
  Spinner,
  StatsCard,
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
  IconRoute,
  IconSearch,
  IconSpark,
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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
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

  const validate = (overrides?: Partial<{
    originCity: string;
    destCity: string;
    travelWindow: string;
    requesterName: string;
    groupSize: number;
  }>): FormErrors => {
    const o = overrides?.originCity ?? originCity;
    const d = overrides?.destCity ?? destCity;
    const w = overrides?.travelWindow ?? travelWindow;
    const n = overrides?.requesterName ?? requesterName;
    const g = overrides?.groupSize ?? groupSize;
    const found: FormErrors = {};
    if (o.trim().length < 3) found.originCity = 'Which city does the group leave from?';
    if (d.trim().length < 3) found.destCity = 'Where is the group going?';
    if (w.trim().length < 4)
      found.travelWindow = 'A date or window, e.g. “12 Jan 2027 · night”.';
    if (n.trim().length < 3)
      found.requesterName = 'A name or the group’s name, so the desk can reply.';
    if (!Number.isFinite(g) || g < 5 || g > 200)
      found.groupSize = 'Group size between 5 and 200 travellers.';
    if (o.trim() && d.trim() && o.trim().toLowerCase() === d.trim().toLowerCase())
      found.destCity = 'Origin and destination are the same city.';
    return found;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    setTouched({
      originCity: true,
      destCity: true,
      travelWindow: true,
      requesterName: true,
      groupSize: true,
    });
    setSubmitError(null);
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
      setTouched({});
      setSubmitError(null);
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
      const msg = result.error ?? 'The ledger rejected that request.';
      setSubmitError(msg);
      onToast(msg, result.throttled ? 'info' : 'error');
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
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex items-center gap-2 text-[12px] text-ink-faint">
          <li>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center px-1 transition-colors duration-200 hover:text-ink-soft"
            >
              Corridors
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="micro text-ink-muted" aria-current="page">
              Corridor requests
            </span>
          </li>
        </ol>
      </nav>
      <header className="flex flex-col gap-5 border-b border-rule pb-6">
        <div className="flex max-w-2xl flex-col gap-2.5">
          <Eyebrow>Demand side · the board is built from this</Eyebrow>
          <h1 className="display text-[clamp(2rem,4.6vw,3.25rem)] text-ink">Corridor requests</h1>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            If your route is not on the board, ask for it. A request carries the group size behind it,
            and group size is exactly what a carrier desk needs before it will release an allotment.
            Requests are public, upvotable, and answered either way.
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Requests"
          value={String(requests.length)}
          change={`${stats.pairs} distinct city pairs`}
          changeTone="lagoon"
          gradient="lagoon"
          icon={<IconRoute size={20} />}
        />
        <StatsCard
          title="Group seats"
          value={number(stats.seats)}
          change="travellers represented"
          changeTone="marigold"
          gradient="marigold"
          icon={<IconUsers size={20} />}
        />
        <StatsCard
          title="Upvotes"
          value={number(stats.votes)}
          change={stats.top !== '—' ? `top ask: ${stats.top}` : 'backed by travellers'}
          changeTone="jade"
          gradient="jade"
          icon={<IconSpark size={20} />}
        />
      </div>

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
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
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
                    size="md"
                    variant="primary"
                    onClick={() => {
                      setQuery('');
                      setModeFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    size="md"
                    variant="primary"
                    onClick={() => document.getElementById('req-origin')?.focus()}
                  >
                    File the first request
                  </Button>
                )
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
                      aria-busy={voting === request.id || undefined}
                      aria-label={`Upvote the ${request.origin_city} to ${request.dest_city} request, currently ${request.upvotes} votes`}
                      className={cn(
                        'flex h-full min-h-[4.5rem] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-card border transition-colors duration-200',
                        voting === request.id
                          ? 'border-accent/60 bg-accent-tint text-accent-deep'
                          : 'border-rule bg-raised text-ink-muted hover:border-accent/50 hover:bg-accent-tint hover:text-accent-deep',
                      )}
                    >
                      {voting === request.id ? (
                        <Spinner size={14} />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M12 5.5 18.5 12H15v6.5H9V12H5.5Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      <span className="tnum text-[15px] font-medium leading-none text-ink">
                        {request.upvotes}
                      </span>{' '}
                      <span className="micro text-[9px] text-ink-faint">
                        {voting === request.id ? 'saving' : 'votes'}
                      </span>
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
                            {request.origin_city}
                            <IconArrow size={13} className="shrink-0 text-ink-faint" />
                            {request.dest_city}
                          </span>
                          <span className="text-[11.5px] text-ink-muted">{request.travel_window}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Chip tone={request.mode === 'bus' ? 'lagoon' : 'marigold'}>
                            {request.mode === 'bus' ? 'coach' : 'air'}
                          </Chip>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-faint">
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

                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-rule-soft pt-2.5">
                        <span className="micro text-ink-faint">
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
            <div className="flex flex-col gap-1.5 border-b border-rule pb-3">
              <Eyebrow>How a request becomes a corridor</Eyebrow>
              <h2 className="display text-[clamp(1.5rem,3vw,2rem)] text-ink">
                Three triggers, one honest answer
              </h2>
            </div>
            <Disclosure
              label="See contracting thresholds & review policy"
              summary="12 upvotes or 20+ group seats"
            >
              <div className="flex flex-col gap-4">
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
                      className="flex flex-col gap-2 rounded-card border border-rule bg-surface px-4 py-4"
                    >
                      <span className="tnum display text-[22px] leading-none text-ink-faint">
                        {item.n}
                      </span>
                      <span className="text-[13px] text-ink">{item.title}</span>
                      <span className="text-[12px] leading-relaxed text-ink-muted">{item.body}</span>
                    </li>
                  ))}
                </ol>
                <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-faint">
                  <IconCheck size={13} className="mt-px shrink-0 text-jade-deep" />
                  Every request gets an answer, including the refusals. If a corridor cannot be contracted —
                  no carrier with spare allotment, or a window inside a schedule freeze — the request is
                  closed with the reason recorded on it rather than left to decay on a list.
                </p>
              </div>
            </Disclosure>
          </section>
        </div>

        {/* Request form */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <Eyebrow>File a request</Eyebrow>
              <h2 className="display text-[21px] leading-tight text-ink">
                Put your group on the board
              </h2>
              <p className="text-[11.5px] leading-relaxed text-ink-muted">
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
              <FormAlert message={submitError} />

              <FormSection step="01" title="Route & travel window">
                <Field
                  label="Leaving from"
                  htmlFor="req-origin"
                  required
                  error={touched.originCity ? errors.originCity : null}
                  errorId="req-origin-error"
                >
                  <TextInput
                    id="req-origin"
                    list="utsav-cities"
                    value={originCity}
                    placeholder="Vijayawada (Amaravati)"
                    aria-describedby={touched.originCity && errors.originCity ? 'req-origin-error' : undefined}
                    invalid={Boolean(touched.originCity && errors.originCity)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOriginCity(v);
                      setSubmitError(null);
                      if (touched.originCity) setErrors(validate({ originCity: v }));
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, originCity: true }));
                      setErrors(validate());
                    }}
                  />
                </Field>
                <datalist id="utsav-cities">
                  {CITY_HINTS.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>

                <Field
                  label="Going to"
                  htmlFor="req-dest"
                  required
                  error={touched.destCity ? errors.destCity : null}
                  errorId="req-dest-error"
                >
                  <TextInput
                    id="req-dest"
                    list="utsav-cities"
                    value={destCity}
                    placeholder="New Delhi"
                    aria-describedby={touched.destCity && errors.destCity ? 'req-dest-error' : undefined}
                    invalid={Boolean(touched.destCity && errors.destCity)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDestCity(v);
                      setSubmitError(null);
                      if (touched.destCity) setErrors(validate({ destCity: v }));
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, destCity: true }));
                      setErrors(validate());
                    }}
                  />
                </Field>

                {matches.length > 0 ? (
                  <div className="rounded-card border border-jade/30 bg-jade-tint px-3 py-2.5">
                    <p className="micro text-jade-deep">already on the board</p>
                    <ul className="mt-2 flex list-none flex-col gap-1.5">
                      {matches.map((c) => (
                        <li key={c.id}>
                          <Link
                            to={corridorPath(c.code)}
                            className="flex min-h-11 items-center justify-between gap-2 text-[11.5px] text-ink-soft transition-colors duration-200 hover:text-ink"
                          >
                            <span className="truncate">
                              {c.origin_code}→{c.dest_code} · {c.departure_date}
                            </span>
                            <span className="tnum shrink-0 text-accent-deep">
                              {rupees(c.tier1_fare)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => matches[0] && onHold(matches[0])}
                      className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium text-jade-deep underline underline-offset-2 hover:decoration-2"
                    >
                      Hold seats on {matches[0]?.code} instead <IconArrow size={11} />
                    </button>
                  </div>
                ) : null}

                <Field
                  label="Travel window"
                  htmlFor="req-window"
                  required
                  error={touched.travelWindow ? errors.travelWindow : null}
                  errorId="req-window-error"
                >
                  <TextInput
                    id="req-window"
                    value={travelWindow}
                    placeholder="12 Jan 2027 · night departure"
                    aria-describedby={touched.travelWindow && errors.travelWindow ? 'req-window-error' : undefined}
                    invalid={Boolean(touched.travelWindow && errors.travelWindow)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTravelWindow(v);
                      setSubmitError(null);
                      if (touched.travelWindow) setErrors(validate({ travelWindow: v }));
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, travelWindow: true }));
                      setErrors(validate());
                    }}
                  />
                </Field>
              </FormSection>

              <FormSection step="02" title="Your group">
                <Field
                  label="Your name or group"
                  htmlFor="req-name"
                  required
                  error={touched.requesterName ? errors.requesterName : null}
                  errorId="req-name-error"
                >
                  <TextInput
                    id="req-name"
                    value={requesterName}
                    placeholder="OMR IT Telugu Sangham"
                    aria-describedby={touched.requesterName && errors.requesterName ? 'req-name-error' : undefined}
                    invalid={Boolean(touched.requesterName && errors.requesterName)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRequesterName(v);
                      setSubmitError(null);
                      if (touched.requesterName) setErrors(validate({ requesterName: v }));
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, requesterName: true }));
                      setErrors(validate());
                    }}
                  />
                </Field>

                <Field
                  label="Group size"
                  htmlFor="req-size"
                  required
                  error={touched.groupSize ? errors.groupSize : null}
                  errorId="req-size-error"
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
                    aria-describedby={touched.groupSize && errors.groupSize ? 'req-size-error' : undefined}
                    invalid={Boolean(touched.groupSize && errors.groupSize)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setGroupSize(v);
                      setSubmitError(null);
                      if (touched.groupSize) setErrors(validate({ groupSize: v }));
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, groupSize: true }));
                      setErrors(validate());
                    }}
                  />
                </Field>
              </FormSection>

              <Disclosure
                label="Optional · Festival & mode"
                summary={`${festival} · ${mode === 'bus' ? 'Coach' : 'Air'}`}
              >
                <div className="flex flex-col gap-3.5">
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

                  <div className="flex flex-col gap-1.5">
                    <span className="micro text-ink-muted">Preferred mode</span>
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
                </div>
              </Disclosure>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                full
                loading={submitting}
                icon={<IconArrow size={14} />}
              >
                {submitting ? 'Publishing request…' : 'Publish request'}
              </Button>
              <p className="text-[11px] leading-snug text-ink-faint">
                Written to <span className="font-mono">utsav_corridor_requests</span> with one upvote
                from you already counted. The desk reviews new rows daily during a festival window.
              </p>
            </form>

            <Divider label="most requested" />
            <p className="text-[12px] text-ink-soft">
              {stats.top}
              <span className="mt-1 block text-[11px] text-ink-faint">
                {stats.pairs} distinct city pairs requested
              </span>
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
