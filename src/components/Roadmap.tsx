import { ALL_ISSUES, LINEAR_PROJECT, MILESTONES, type LinearStateType } from '../data/roadmap';
import { Panel, PanelHead, Tag, type TagTone } from './ui';

const STATE_TONE: Record<LinearStateType, TagTone> = {
  completed: 'verdant',
  started: 'marigold',
  unstarted: 'sky',
  backlog: 'neutral',
  canceled: 'neutral',
};

const STACK = [
  {
    layer: 'Product & ops',
    tool: 'Linear',
    detail: `Team ${LINEAR_PROJECT.team} · project "${LINEAR_PROJECT.name}" · 4 milestones · ${ALL_ISSUES.length} issues`,
    href: LINEAR_PROJECT.url,
    hrefLabel: 'open project',
  },
  {
    layer: 'Data & realtime',
    tool: 'Supabase',
    detail:
      'Project txbgovhxqxvlioszevbe (ap-south-1, Postgres 17) · migration utsav_corridor_schema_and_seed · 4 tables in the realtime publication · 2 SECURITY DEFINER RPCs · RLS on every table',
    href: 'https://supabase.com/dashboard/project/txbgovhxqxvlioszevbe',
    hrefLabel: 'open studio',
  },
  {
    layer: 'Hosting & delivery',
    tool: 'Vercel',
    detail:
      'Project utsav-corridor · team pavan-4ae5 · Vite preset · output dist · env VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_LINEAR_TEAM_KEY on production, preview and development',
    href: 'https://vercel.com/pavan-4ae5/utsav-corridor',
    hrefLabel: 'open project',
  },
  {
    layer: 'Source',
    tool: 'GitHub',
    detail: 'dommetipavan26-tech/experiment1 · branch arena/535d4836-experiment1',
    href: 'https://github.com/dommetipavan26-tech/experiment1',
    hrefLabel: 'open repo',
  },
];

export function Roadmap() {
  const done = ALL_ISSUES.filter((i) => i.stateType === 'completed').length;
  const active = ALL_ISSUES.filter((i) => i.stateType === 'started').length;
  const planned = ALL_ISSUES.filter(
    (i) => i.stateType === 'unstarted' || i.stateType === 'backlog',
  ).length;

  return (
    <div className="space-y-8">
      <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="milestones" value="4" sub={LINEAR_PROJECT.window} />
        <Cell label="shipped" value={String(done)} sub="done in Linear" tone="verdant" />
        <Cell label="in progress" value={String(active)} sub="being built now" tone="marigold" />
        <Cell label="planned" value={String(planned)} sub="todo + backlog" tone="sky" />
      </div>

      <Panel tone="flat">
        <PanelHead eyebrow="live stack" title="Every connector this product runs on" />
        <ul className="divide-y divide-hairline-soft">
          {STACK.map((s) => (
            <li key={s.tool} className="grid gap-2 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4 sm:px-5">
              <div>
                <p className="micro text-ink-400">{s.layer}</p>
                <p className="mt-1 text-[13px] font-semibold text-ink">{s.tool}</p>
              </div>
              <div>
                <p className="text-[12px] leading-relaxed break-words text-ink-500">{s.detail}</p>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="micro mt-1.5 inline-flex items-center gap-1 text-marigold hover:text-marigold-bright"
                >
                  {s.hrefLabel}
                  <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
                    <path d="M2 8L8 2M4 2h4v4" stroke="currentColor" fill="none" strokeWidth="1.3" />
                  </svg>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <div>
        <div className="border-t border-ink pt-5">
          <p className="micro text-marigold">delivery plan</p>
          <h2 className="font-display mt-2 text-[24px] leading-tight font-medium tracking-[-0.015em] text-ink sm:text-[28px]">
            Four milestones from contracts to the Sankranti 2027 pilot
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            Mirrored from Linear team {LINEAR_TEAM_LABEL}. Each issue links straight to its Linear
            record, so the board you are reading and the tracker the team works from are the same
            plan.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {MILESTONES.map((m) => {
            const milestoneDone = m.issues.filter((i) => i.stateType === 'completed').length;
            return (
              <Panel key={m.name}>
                <PanelHead
                  eyebrow={m.target}
                  title={m.name}
                  aside={
                    <span className="tnum font-mono text-[11px] text-ink-400">
                      {milestoneDone}/{m.issues.length} done
                    </span>
                  }
                />
                <p className="border-b border-hairline-soft px-4 py-2.5 text-[12px] leading-relaxed text-ink-500 sm:px-5">
                  {m.blurb}
                </p>
                <ul className="divide-y divide-hairline-soft">
                  {m.issues.map((issue) => (
                    <li key={issue.key}>
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="grid gap-2 px-4 py-3 transition-colors hover:bg-paper-2 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5"
                      >
                        <span className="font-mono text-[11px] font-semibold tracking-[0.04em] text-ink-400">
                          {issue.key}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium leading-snug text-ink">
                            {issue.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <Tag tone={STATE_TONE[issue.stateType]}>{issue.state}</Tag>
                            <Tag tone="neutral">{issue.label}</Tag>
                            <span className="tnum font-mono text-[10.5px] text-ink-400">
                              due {issue.due} · {issue.estimate} pts · {issue.priority}
                            </span>
                          </span>
                        </span>
                        <span className="hidden shrink-0 sm:block">
                          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-ink-300" aria-hidden="true">
                            <path d="M2 8L8 2M4 2h4v4" stroke="currentColor" fill="none" strokeWidth="1.3" />
                          </svg>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const LINEAR_TEAM_LABEL = LINEAR_PROJECT.team;

function Cell({
  label,
  value,
  sub,
  tone = 'ink',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'ink' | 'verdant' | 'marigold' | 'sky';
}) {
  const tones = {
    ink: 'text-ink',
    verdant: 'text-verdant',
    marigold: 'text-marigold',
    sky: 'text-sky',
  } as const;
  return (
    <div className="bg-paper-3 px-4 py-3.5">
      <p className="micro text-ink-400">{label}</p>
      <p className={`tnum font-display mt-1 text-[24px] leading-none font-medium ${tones[tone]}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-ink-400">{sub}</p>
    </div>
  );
}
