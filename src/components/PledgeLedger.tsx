import type { Corridor, DeskSource, Pledge } from '../lib/types';
import { initials, relativeTime, rupees } from '../lib/format';
import { Panel, PanelHead, Tag } from './ui';

export function PledgeLedger({
  pledges,
  corridors,
  source,
  onOpen,
}: {
  pledges: Pledge[];
  corridors: Corridor[];
  source: DeskSource;
  onOpen: (c: Corridor) => void;
}) {
  const byId = new Map(corridors.map((c) => [c.id, c]));
  const rows = pledges.slice(0, 8);

  return (
    <Panel className="h-full">
      <PanelHead
        eyebrow="receipts"
        title="Pledge ledger"
        aside={<Tag tone={source === 'live' ? 'verdant' : 'marigold'}>{source === 'live' ? 'streaming' : 'snapshot'}</Tag>}
      />
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-ink-400 sm:px-5">
          No pledges yet. The first one you hold will appear here and stream to every open board.
        </p>
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {rows.map((p) => {
            const corridor = byId.get(p.corridor_id);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-paper-2 font-mono text-[10.5px] font-semibold text-ink-500">
                  {initials(p.passenger_name)}
                </span>
                <button
                  type="button"
                  onClick={() => corridor && onOpen(corridor)}
                  className="min-w-0 flex-1 text-left"
                  disabled={!corridor}
                >
                  <span className="block truncate text-[12.5px] font-medium text-ink hover:text-marigold">
                    {p.passenger_name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-400">
                    {p.booking_ref} · {corridor ? `${corridor.origin_code}→${corridor.dest_code}` : '—'} ·{' '}
                    {relativeTime(p.created_at)}
                  </span>
                </button>
                <span className="shrink-0 text-right">
                  <span className="tnum block font-mono text-[12px] text-ink">
                    {rupees(p.total_payable)}
                  </span>
                  <span className="tnum block font-mono text-[10px] text-verdant">
                    −{rupees(p.estimated_saving)}
                  </span>
                </span>
                <Tag
                  tone={p.status === 'allotment_confirmed' ? 'verdant' : 'marigold'}
                  className="hidden shrink-0 sm:inline-flex"
                >
                  {p.status === 'allotment_confirmed' ? 'confirmed' : 'escrow'}
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-hairline-soft px-4 py-2 sm:px-5">
        <p className="text-[10.5px] leading-relaxed text-ink-400">
          Every row is a Postgres row in <span className="font-mono">utsav_pledges</span>, written by the{' '}
          <span className="font-mono">utsav_join_cohort()</span> transaction and streamed back over
          Realtime. Fee and saving are stored, not recomputed in the browser.
        </p>
      </div>
    </Panel>
  );
}
