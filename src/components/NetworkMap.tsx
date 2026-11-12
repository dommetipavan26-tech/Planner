import { useCallback, useMemo, useState } from 'react';
import { Link, corridorPath } from '../lib/router';
import { fillPct } from '../lib/format';
import type { Corridor } from '../lib/types';

/**
 * An aeronautical-chart style network view: meridians and parallels as a
 * graticule, one arc per live corridor, arc weight tracking pledged seats. It
 * deliberately does not pretend to be a political map — the caption says so.
 */

const VIEW_W = 420;
const VIEW_H = 360;
const PAD_X = 46;
const PAD_TOP = 30;
const PAD_BOTTOM = 34;

const LON_MIN = 74;
const LON_MAX = 86;
const LAT_MIN = 11;
const LAT_MAX = 31;

interface Point {
  x: number;
  y: number;
}

function project(lat: number, lon: number): Point {
  const x = PAD_X + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (VIEW_W - PAD_X * 2);
  const y = PAD_TOP + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (VIEW_H - PAD_TOP - PAD_BOTTOM);
  return { x, y };
}

/** Bow the arc perpendicular to its chord so paired routes never overlap. */
function arcPath(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(56, dist * 0.22);
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = (a.x + b.x) / 2 + nx * bow;
  const cy = (a.y + b.y) / 2 + ny * bow;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

interface PositionedNode {
  code: string;
  label: string;
  x: number;
  y: number;
  count: number;
}

function buildNodes(corridors: Corridor[]): PositionedNode[] {
  const map = new Map<string, PositionedNode>();

  const put = (code: string, label: string, lat: number | null, lon: number | null) => {
    if (!code || lat == null || lon == null) return;
    if (map.has(code)) return;
    const p = project(lat, lon);
    map.set(code, { code, label, x: p.x, y: p.y, count: 0 });
  };

  for (const c of corridors) {
    put(c.origin_code, c.origin_city, c.lat, c.lon);
    put(c.dest_code, c.dest_city, c.dest_lat, c.dest_lon);
  }
  for (const c of corridors) {
    const origin = map.get(c.origin_code);
    const dest = map.get(c.dest_code);
    if (origin) origin.count += 1;
    if (dest) dest.count += 1;
  }
  return [...map.values()];
}

export function NetworkMap({
  corridors,
  className,
}: {
  corridors: Corridor[];
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const nodes = useMemo(() => buildNodes(corridors), [corridors]);

  const arcs = useMemo(
    () =>
      corridors
        .filter((c) => c.lat != null && c.lon != null && c.dest_lat != null && c.dest_lon != null)
        .map((c) => ({
          corridor: c,
          path: arcPath(
            project(c.lat as number, c.lon as number),
            project(c.dest_lat as number, c.dest_lon as number),
          ),
        })),
    [corridors],
  );

  const onFocusNode = useCallback((code: string | null) => setHovered(code), []);

  const meridians = [76, 78, 80, 82, 84];
  const parallels = [12, 16, 20, 24, 28];

  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-card border border-line bg-night-900">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Routing diagram: ${arcs.length} festival corridors across ${nodes.length} cities`}
        >
          <defs>
            <linearGradient id="utsav-arc-air" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e8a33d" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#e8a33d" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="utsav-arc-road" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#63a9d6" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#63a9d6" stopOpacity="0.95" />
            </linearGradient>
            <radialGradient id="utsav-node-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f4f1ea" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#f4f1ea" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g stroke="#1b2331" strokeWidth="0.6" aria-hidden="true">
            {meridians.map((lon) => {
              const { x } = project(LAT_MIN, lon);
              return (
                <line key={`m${lon}`} x1={x} y1={PAD_TOP - 12} x2={x} y2={VIEW_H - PAD_BOTTOM + 12} />
              );
            })}
            {parallels.map((lat) => {
              const { y } = project(lat, LON_MIN);
              return (
                <line key={`p${lat}`} x1={PAD_X - 22} y1={y} x2={VIEW_W - PAD_X + 22} y2={y} />
              );
            })}
          </g>

          <g fill="#4e5464" fontSize="7" aria-hidden="true">
            {meridians.map((lon) => {
              const { x } = project(LAT_MIN, lon);
              return (
                <text
                  key={`ml${lon}`}
                  x={x}
                  y={VIEW_H - PAD_BOTTOM + 24}
                  textAnchor="middle"
                  letterSpacing="0.1em"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {lon}°E
                </text>
              );
            })}
            {parallels.map((lat) => {
              const { y } = project(lat, LON_MIN);
              return (
                <text
                  key={`pl${lat}`}
                  x={PAD_X - 27}
                  y={y + 2.5}
                  textAnchor="end"
                  letterSpacing="0.1em"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {lat}°N
                </text>
              );
            })}
          </g>

          <g fill="none" strokeLinecap="round">
            {arcs.map(({ corridor, path }) => {
              const related =
                hovered === null ||
                corridor.origin_code === hovered ||
                corridor.dest_code === hovered;
              const weight = 0.9 + (fillPct(corridor) / 100) * 2.2;
              const stroke = corridor.mode === 'bus' ? 'url(#utsav-arc-road)' : 'url(#utsav-arc-air)';
              return (
                <g
                  key={corridor.id}
                  opacity={related ? 1 : 0.16}
                  style={{ transition: 'opacity .3s ease' }}
                >
                  <path d={path} stroke={stroke} strokeWidth={weight} />
                  {corridor.pledged_seats >= corridor.tier1_min ? (
                    <path
                      d={path}
                      stroke={corridor.mode === 'bus' ? '#63a9d6' : '#e8a33d'}
                      strokeWidth={Math.max(1.1, weight * 0.45)}
                      strokeDasharray="3 9"
                      opacity="0.7"
                      className="animate-dash"
                    />
                  ) : null}
                </g>
              );
            })}
          </g>

          {nodes.map((node) => {
            const active = hovered === node.code;
            const hub = node.code === 'DEL';
            return (
              <g
                key={node.code}
                transform={`translate(${node.x.toFixed(2)} ${node.y.toFixed(2)})`}
                onMouseEnter={() => onFocusNode(node.code)}
                onMouseLeave={() => onFocusNode(null)}
                role="img"
                aria-label={`${node.label}, station ${node.code}, ${node.count} corridor${
                  node.count === 1 ? '' : 's'
                }`}
              >
                <circle r="15" fill="url(#utsav-node-halo)" opacity={active ? 1 : 0.4} />
                <circle r="7.5" fill="transparent" />
                <circle
                  r={hub ? 4 : 3}
                  fill={active ? '#f4f1ea' : hub ? '#e8a33d' : '#a9aebc'}
                  stroke="#06080e"
                  strokeWidth="1.2"
                  style={{ transition: 'fill .2s ease' }}
                />
                <text
                  x="0"
                  y="-9"
                  textAnchor="middle"
                  fontSize="8.5"
                  letterSpacing="0.14em"
                  fill={active ? '#f4f1ea' : '#a9aebc'}
                  style={{ fontFamily: 'var(--font-mono)', transition: 'fill .2s ease' }}
                >
                  {node.code}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-12"
          style={{
            backgroundImage:
              'linear-gradient(to top, #0a0e17 8%, rgba(10,14,23,0.9) 45%, rgba(10,14,23,0) 100%)',
          }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <LegendLine color="#e8a33d" label="Air corridor" />
            <LegendLine color="#63a9d6" label="Coach corridor" />
            <LegendLine color="#f4f1ea" label="Dashed = tier locked" dashed />
          </div>
          <p className="micro text-mist-faint">
            {nodes.length} nodes · {arcs.length} routes
          </p>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-md text-[11.5px] leading-relaxed text-mist-faint">
          Routing diagram only. Arc weight tracks pledged seats against the carrier allotment, not
          distance or price. Node chips below are keyboard-reachable.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {nodes
            .slice()
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((node) => (
              <button
                key={node.code}
                type="button"
                onMouseEnter={() => onFocusNode(node.code)}
                onMouseLeave={() => onFocusNode(null)}
                onFocus={() => onFocusNode(node.code)}
                onBlur={() => onFocusNode(null)}
                aria-pressed={hovered === node.code}
                className={
                  'micro rounded-pill border px-2 py-1 transition-colors duration-200 ' +
                  (hovered === node.code
                    ? 'border-marigold/60 bg-marigold-veil text-marigold'
                    : 'border-line bg-night-850 text-mist-dim hover:border-line-bright hover:text-mist')
                }
              >
                {node.code}
                <span className="tnum ml-1.5 opacity-60">{node.count}</span>
              </button>
            ))}
        </div>
      </figcaption>
    </figure>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true">
        <line
          x1="1"
          y1="3"
          x2="21"
          y2="3"
          stroke={color}
          strokeWidth={dashed ? 1.4 : 2}
          strokeLinecap="round"
          strokeDasharray={dashed ? '3 4' : undefined}
        />
      </svg>
      <span className="micro text-mist-dim">{label}</span>
    </span>
  );
}

/** The busiest corridors, as a rail of links. */
export function CorridorRail({ corridors }: { corridors: Corridor[] }) {
  const sorted = useMemo(
    () => [...corridors].sort((a, b) => b.pledged_seats - a.pledged_seats).slice(0, 6),
    [corridors],
  );
  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((c) => (
        <Link
          key={c.id}
          to={corridorPath(c.code)}
          className="group inline-flex items-center gap-2 rounded-pill border border-line bg-night-850 px-3 py-1.5 transition-colors duration-200 hover:border-marigold/50 hover:bg-night-800"
        >
          <span className="micro text-mist-dim group-hover:text-marigold">{c.code}</span>
          <span className="tnum text-[11.5px] text-mist-faint">
            {c.pledged_seats}/{c.total_allotment}
          </span>
        </Link>
      ))}
    </div>
  );
}
