import {
  DIMENSIONS,
  MONEY_FLOW,
  RISKS,
  STRENGTHS,
  VERDICT_BODY,
  VERDICT_HEADLINE,
  WEIGHTED_SCORE,
  WHAT_WOULD_RAISE_THE_SCORE,
  gradeFor,
} from '../data/review';
import { UnitEconomics } from './UnitEconomics';
import { Panel, PanelHead, Tag } from './ui';

const SEVERITY_TONE = {
  critical: 'surge',
  high: 'marigold',
  medium: 'neutral',
} as const;

export function Review() {
  const paragraphs = VERDICT_BODY.split('\n\n');

  return (
    <div className="space-y-10">
      {/* Verdict */}
      <div className="overflow-hidden rounded-card border border-ink bg-ink text-paper">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <div className="border-b border-ink-700 p-5 lg:border-r lg:border-b-0 sm:p-6">
            <p className="micro text-ink-400">weighted founder score</p>
            <p className="tnum font-display mt-3 text-[64px] leading-none font-medium text-paper">
              {WEIGHTED_SCORE.toFixed(1)}
              <span className="text-[26px] text-ink-400">/10</span>
            </p>
            <p className="mt-3 flex items-center gap-2">
              <span className="micro rounded-[2px] border border-marigold-bright/50 bg-marigold/15 px-2 py-1 text-[#f0b57a]">
                grade {gradeFor(WEIGHTED_SCORE)}
              </span>
              <span className="micro text-ink-400">8 dimensions, weighted</span>
            </p>
            <div className="mt-5">
              <ScoreRadar />
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <p className="micro text-marigold-bright">the verdict</p>
            <h2 className="font-display mt-2 text-[24px] leading-[1.2] font-medium tracking-[-0.015em] text-paper sm:text-[28px]">
              {VERDICT_HEADLINE}
            </h2>
            <div className="mt-4 space-y-3">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-[13.5px] leading-[1.7] text-ink-300">
                  {p}
                </p>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-700 pt-4">
              <Tag tone="ink" className="border-ink-600 bg-ink-800 text-paper">
                wedge: ap ↔ delhi festival corridors
              </Tag>
              <Tag tone="ink" className="border-ink-600 bg-ink-800 text-paper">
                beachhead: coach charters before air
              </Tag>
              <Tag tone="ink" className="border-ink-600 bg-ink-800 text-paper">
                blocker: escrow + iata/tasf
              </Tag>
              <Tag tone="ink" className="border-ink-600 bg-ink-800 text-paper">
                moat: contracts + communities
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {/* Dimensions */}
      <section>
        <SectionTitle
          eyebrow="01 · scoring"
          title="Where the idea is strong and where it breaks"
          lede="Eight weighted dimensions. Weights reflect what actually kills travel marketplaces: economics and supply control outweigh market size."
        />
        <ul className="mt-5 divide-y divide-hairline-soft border-y border-hairline">
          {DIMENSIONS.map((d) => (
            <li key={d.key} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:gap-6">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{d.label}</p>
                  <p className="tnum font-mono text-[13px] font-semibold text-ink">
                    {d.score.toFixed(1)}
                    <span className="text-ink-300">/10</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[2px] bg-paper-2 ring-1 ring-hairline-soft ring-inset">
                  <div
                    className={`h-full transition-[width] duration-700 ${
                      d.score >= 7.5 ? 'bg-verdant' : d.score >= 6 ? 'bg-sky' : d.score >= 5 ? 'bg-marigold' : 'bg-surge'
                    }`}
                    style={{ width: `${d.score * 10}%` }}
                  />
                </div>
                <p className="mt-2 flex items-center gap-2">
                  <Tag
                    tone={
                      d.score >= 7.5 ? 'verdant' : d.score >= 6 ? 'sky' : d.score >= 5 ? 'marigold' : 'surge'
                    }
                  >
                    {d.verdict}
                  </Tag>
                  <span className="tnum font-mono text-[10.5px] text-ink-400">
                    weight {Math.round(d.weight * 100)}%
                  </span>
                </p>
              </div>
              <p className="text-[12.5px] leading-[1.7] text-ink-500">{d.evidence}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Strengths */}
      <section>
        <SectionTitle
          eyebrow="02 · what is genuinely right"
          title="Six things working in your favour"
        />
        <div className="mt-5 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {STRENGTHS.map((s, i) => (
            <div key={s.title} className="bg-paper-3 px-4 py-4">
              <p className="tnum font-mono text-[10.5px] text-marigold">
                {String(i + 1).padStart(2, '0')}
              </p>
              <p className="mt-1.5 text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                {s.title}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Risks */}
      <section>
        <SectionTitle
          eyebrow="03 · risk register"
          title="Eight things that will hurt, and what to do about each"
          lede="Ordered by severity. Two of these are existential and must be answered before the first paid cohort, not after."
        />
        <ul className="mt-5 space-y-3">
          {RISKS.map((r, i) => (
            <li key={r.title} className="rounded-card border border-hairline bg-paper-3">
              <div className="flex flex-wrap items-center gap-2 border-b border-hairline-soft px-4 py-2.5">
                <span className="tnum font-mono text-[10.5px] text-ink-300">
                  R{String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{r.title}</p>
                <Tag tone={SEVERITY_TONE[r.severity]} className="ml-auto">
                  {r.severity}
                </Tag>
              </div>
              <div className="grid gap-px bg-hairline-soft lg:grid-cols-2">
                <div className="bg-paper-3 px-4 py-3">
                  <p className="micro mb-1.5 text-surge">the reality</p>
                  <p className="text-[12.5px] leading-[1.65] text-ink-600">{r.reality}</p>
                </div>
                <div className="bg-paper-3 px-4 py-3">
                  <p className="micro mb-1.5 text-verdant">what you do about it</p>
                  <p className="text-[12.5px] leading-[1.65] text-ink-600">{r.mitigation}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Money flow */}
      <section>
        <SectionTitle
          eyebrow="04 · money movement"
          title="Where the rupee sits at each step"
          lede="The regulatory question is not whether you take a fee — it is whether traveler money ever touches your account. It must not."
        />
        <ol className="mt-5 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {MONEY_FLOW.map((m) => (
            <li key={m.step} className="flex gap-3 bg-paper-3 px-4 py-3.5">
              <span className="tnum font-mono text-[11px] text-marigold">{m.step}</span>
              <span>
                <span className="block text-[13px] font-semibold text-ink">{m.label}</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">{m.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Unit economics */}
      <section>
        <SectionTitle
          eyebrow="05 · unit economics"
          title="Run your own numbers"
          lede="Seeded with the live VGA → DEL Sankranti block: 60 seats, ₹7,650 net group fare against ₹14,850 festival retail. Move the sliders and watch the contribution cross zero."
        />
        <div className="mt-5">
          <UnitEconomics />
        </div>
      </section>

      {/* What would raise the score */}
      <section>
        <SectionTitle
          eyebrow="06 · the path to an A"
          title="What would move this from 6.6 to 8+"
          lede="None of these are software. They are five pieces of evidence an investor or a carrier would ask for first."
        />
        <div className="mt-5">
          <Panel>
            <PanelHead eyebrow="evidence checklist" title="Before raising money or scaling corridors" />
            <ol className="divide-y divide-hairline-soft">
              {WHAT_WOULD_RAISE_THE_SCORE.map((w, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border border-hairline bg-paper-2">
                    <span className="tnum font-mono text-[10px] text-ink-400">{i + 1}</span>
                  </span>
                  <p className="text-[12.5px] leading-relaxed text-ink-600">{w}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="border-t border-ink pt-5">
      <p className="micro text-marigold">{eyebrow}</p>
      <h2 className="font-display mt-2 max-w-3xl text-[24px] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[28px]">
        {title}
      </h2>
      {lede ? <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">{lede}</p> : null}
    </div>
  );
}

/** Eight-axis score polygon, hand-drawn SVG. */
function ScoreRadar() {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = 88;
  const n = DIMENSIONS.length;

  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = (value / 10) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };

  const gridLevels = [2.5, 5, 7.5, 10];
  const dataPoints = DIMENSIONS.map((d, i) => point(i, d.score));
  const polygon = dataPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size + 8}`} className="w-full max-w-[280px]" role="img" aria-label="Score polygon across eight dimensions">
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={DIMENSIONS.map((_, i) => {
            const [x, y] = point(i, level);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ')}
          fill="none"
          stroke="#2a313d"
          strokeWidth="1"
        />
      ))}
      {DIMENSIONS.map((_, i) => {
        const [x, y] = point(i, 10);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#222934" strokeWidth="1" />;
      })}
      <polygon points={polygon} fill="rgba(217,116,20,0.22)" stroke="#d97414" strokeWidth="1.5" />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill="#f0b57a" />
      ))}
      {DIMENSIONS.map((d, i) => {
        const [x, y] = point(i, 13.1);
        const anchor = x > cx + 6 ? 'start' : x < cx - 6 ? 'end' : 'middle';
        return (
          <text
            key={d.key}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fill="#a6adb9"
            style={{ font: '600 8.5px "JetBrains Mono Variable", monospace', letterSpacing: '0.06em' }}
          >
            {d.label.split(' ')[0].toUpperCase()} {d.score.toFixed(1)}
          </text>
        );
      })}
    </svg>
  );
}
