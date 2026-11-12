import { useState } from 'react';
import type { CorridorRequest, DeskSource } from '../lib/types';
import { relativeTime } from '../lib/format';
import type { RequestPayload } from '../hooks/useCorridorDesk';
import { Button, Field, Panel, PanelHead, Select, Tag, TextInput, useToast } from './ui';

const EMPTY: RequestPayload = {
  originCity: '',
  destCity: '',
  festival: 'Sankranti 2027',
  mode: 'flight',
  travelWindow: '',
  requesterName: '',
  groupSize: 10,
};

const FESTIVALS = [
  'Sankranti 2027',
  'Ugadi 2027',
  'Dussehra 2027',
  'Diwali 2027',
  'Summer vacation 2027',
  'Wedding season block',
];

export function DemandBoard({
  requests,
  source,
  onSubmitRequest,
  onUpvote,
}: {
  requests: CorridorRequest[];
  source: DeskSource;
  onSubmitRequest: (
    payload: RequestPayload,
  ) => Promise<{ ok: boolean; error?: string; data?: CorridorRequest; simulated?: boolean }>;
  onUpvote: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<RequestPayload>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalSeatsRequested = requests.reduce((sum, r) => sum + r.group_size, 0);
  const totalVotes = requests.reduce((sum, r) => sum + r.upvotes, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.originCity.trim().length < 3) next.originCity = 'Where does the cohort start?';
    if (form.destCity.trim().length < 3) next.destCity = 'Where is it going?';
    if (form.travelWindow.trim().length < 4) next.travelWindow = 'Give a date or date range.';
    if (form.requesterName.trim().length < 3) next.requesterName = 'Who is anchoring this cohort?';
    if (form.groupSize < 1) next.groupSize = 'At least 1 seat.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const res = await onSubmitRequest({
      ...form,
      originCity: form.originCity.trim(),
      destCity: form.destCity.trim(),
      travelWindow: form.travelWindow.trim(),
      requesterName: form.requesterName.trim(),
    });
    setBusy(false);

    if (!res.ok) {
      toast.push({ tone: 'error', title: 'Request not recorded', body: res.error });
      return;
    }
    toast.push({
      tone: 'ok',
      title: res.simulated ? 'Request held locally' : 'Corridor request posted',
      body: `${form.originCity} → ${form.destCity}, ${form.festival}. A block opens when it clears 15 committed seats.`,
    });
    setForm(EMPTY);
  };

  const vote = async (id: string) => {
    setVoting(id);
    const res = await onUpvote(id);
    setVoting(null);
    if (!res.ok) toast.push({ tone: 'error', title: 'Could not register the vote', body: res.error });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Panel>
          <PanelHead
            eyebrow="route intake"
            title="Requested corridors"
            aside={
              <div className="flex items-center gap-3">
                <span className="tnum font-mono text-[11px] text-ink-400">
                  {requests.length} routes · {totalSeatsRequested} seats · {totalVotes} votes
                </span>
                <Tag tone={source === 'live' ? 'verdant' : 'marigold'}>
                  {source === 'live' ? 'live' : 'snapshot'}
                </Tag>
              </div>
            }
          />
          <ul className="divide-y divide-hairline-soft">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start gap-4 px-4 py-3.5 sm:px-5">
                <button
                  type="button"
                  onClick={() => void vote(r.id)}
                  disabled={voting === r.id}
                  className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-card border border-hairline bg-paper-2 py-2 transition-colors hover:border-marigold hover:bg-marigold-soft disabled:opacity-50"
                  aria-label={`Upvote ${r.origin_city} to ${r.dest_city}`}
                >
                  <svg viewBox="0 0 12 8" className="h-2 w-3 text-ink-500" aria-hidden="true">
                    <path d="M6 0l6 8H0z" fill="currentColor" />
                  </svg>
                  <span className="tnum font-mono text-[13px] font-semibold text-ink">{r.upvotes}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                    {r.origin_city} <span className="text-ink-300">→</span> {r.dest_city}
                  </p>
                  <p className="mt-1 text-[11.5px] text-ink-500">{r.travel_window}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Tag tone="neutral">{r.festival}</Tag>
                    <Tag tone={r.mode === 'flight' ? 'sky' : 'road'}>
                      {r.mode === 'flight' ? 'air block' : 'coach charter'}
                    </Tag>
                    <Tag tone="marigold">{r.group_size} committed</Tag>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-400">
                    anchored by {r.requester_name} · {relativeTime(r.created_at)}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="micro text-ink-400">viability</p>
                  <p
                    className={`tnum font-mono text-[13px] font-semibold ${
                      r.group_size >= 45
                        ? 'text-verdant'
                        : r.group_size >= 30
                          ? 'text-sky'
                          : r.group_size >= 15
                            ? 'text-marigold'
                            : 'text-ink-400'
                    }`}
                  >
                    {r.group_size >= 45 ? 'tier iii' : r.group_size >= 30 ? 'tier ii' : r.group_size >= 15 ? 'tier i' : 'seed'}
                  </p>
                </div>
              </li>
            ))}
            {requests.length === 0 ? (
              <li className="px-4 py-10 text-center text-[12.5px] text-ink-400 sm:px-5">
                No requests yet. Corridors open where a cohort already exists.
              </li>
            ) : null}
          </ul>
        </Panel>

        <div className="mt-4 rounded-card border border-hairline bg-paper-2 px-4 py-3.5">
          <p className="micro text-ink-400">how a request becomes a corridor</p>
          <ol className="mt-2 grid gap-2 text-[12.5px] leading-relaxed text-ink-600 sm:grid-cols-3">
            <li>
              <span className="tnum mr-1.5 font-mono text-[11px] text-marigold">01</span>
              A community anchors 15+ committed seats on a dated route.
            </li>
            <li>
              <span className="tnum mr-1.5 font-mono text-marigold">02</span>
              The desk asks two carriers for a net group fare and an EMD term.
            </li>
            <li>
              <span className="tnum mr-1.5 font-mono text-marigold">03</span>
              The block publishes with its tier ladder and a lock deadline.
            </li>
          </ol>
        </div>
      </div>

      <div className="lg:col-span-5">
        <Panel className="h-full">
          <PanelHead eyebrow="traveler side" title="Request a corridor" />
          <form onSubmit={submit} className="space-y-3 px-4 py-4 sm:px-5" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From" error={errors.originCity}>
                <TextInput
                  value={form.originCity}
                  onChange={(e) => setForm((f) => ({ ...f, originCity: e.target.value }))}
                  placeholder="Rajahmundry (RJA)"
                  invalid={Boolean(errors.originCity)}
                />
              </Field>
              <Field label="To" error={errors.destCity}>
                <TextInput
                  value={form.destCity}
                  onChange={(e) => setForm((f) => ({ ...f, destCity: e.target.value }))}
                  placeholder="New Delhi (DEL)"
                  invalid={Boolean(errors.destCity)}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Festival window">
                <Select
                  value={form.festival}
                  onChange={(e) => setForm((f) => ({ ...f, festival: e.target.value }))}
                >
                  {FESTIVALS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mode">
                <Select
                  value={form.mode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mode: e.target.value as 'flight' | 'bus' }))
                  }
                >
                  <option value="flight">Air — group PNR</option>
                  <option value="bus">Coach — chartered</option>
                </Select>
              </Field>
            </div>

            <Field label="Travel dates" error={errors.travelWindow}>
              <TextInput
                value={form.travelWindow}
                onChange={(e) => setForm((f) => ({ ...f, travelWindow: e.target.value }))}
                placeholder="10–13 Jan 2027, morning departure"
                invalid={Boolean(errors.travelWindow)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Field label="Anchoring group" hint="association, alumni wing, team" error={errors.requesterName}>
                <TextInput
                  value={form.requesterName}
                  onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))}
                  placeholder="Godavari NRI & Delhi Chapter"
                  invalid={Boolean(errors.requesterName)}
                />
              </Field>
              <Field label="Committed seats" error={errors.groupSize}>
                <TextInput
                  type="number"
                  min={1}
                  max={300}
                  value={form.groupSize}
                  onChange={(e) => setForm((f) => ({ ...f, groupSize: Number(e.target.value) }))}
                  invalid={Boolean(errors.groupSize)}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-hairline-soft pt-3">
              <p className="text-[11px] leading-snug text-ink-400">
                Requests are public. Upvotes decide which block the desk negotiates next.
              </p>
              <Button type="submit" loading={busy}>
                Post request
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
