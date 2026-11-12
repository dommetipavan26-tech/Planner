import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/* ---------------------------------------------------------------- Panels */

export function Panel({
  children,
  className = '',
  tone = 'raised',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'raised' | 'flat' | 'ink';
}) {
  const tones: Record<string, string> = {
    raised: 'bg-paper-3 border-hairline',
    flat: 'bg-paper-2 border-hairline-soft',
    ink: 'bg-ink text-paper border-ink',
  };
  return (
    <section className={`border ${tones[tone]} rounded-card ${className}`}>{children}</section>
  );
}

export function PanelHead({
  eyebrow,
  title,
  aside,
  tone = 'light',
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3 sm:px-5 ${
        tone === 'dark' ? 'border-ink-700' : 'border-hairline-soft'
      }`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p
            className={`micro mb-1 ${tone === 'dark' ? 'text-ink-300' : 'text-ink-400'}`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={`font-display text-[19px] leading-tight font-medium tracking-[-0.01em] ${
            tone === 'dark' ? 'text-paper' : 'text-ink'
          }`}
        >
          {title}
        </h2>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  lede,
  aside,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-t border-ink pt-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="micro mb-2 flex items-center gap-2 text-marigold">
          {index ? <span className="tnum text-ink-400">{index}</span> : null}
          {eyebrow}
        </p>
        <h2 className="font-display text-[26px] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[32px]">
          {title}
        </h2>
        {lede ? <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{lede}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Buttons */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-ink text-paper hover:bg-ink-700 border-ink',
    accent: 'bg-marigold text-white hover:bg-marigold-bright border-marigold',
    outline: 'bg-transparent text-ink hover:bg-paper-2 border-hairline',
    ghost: 'bg-transparent text-ink-500 hover:text-ink hover:bg-paper-2 border-transparent',
    danger: 'bg-surge text-white hover:brightness-110 border-surge',
  };
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-[12px]',
    md: 'h-10 px-4 text-[13px]',
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-card border font-semibold tracking-[-0.005em] transition-all duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Fields */

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="micro mb-1.5 flex items-baseline justify-between gap-2 text-ink-400">
        <span>{label}</span>
        {hint ? <span className="normal-case tracking-normal text-[10.5px] text-ink-300">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11.5px] font-medium text-surge">{error}</span> : null}
    </label>
  );
}

const controlBase =
  'w-full rounded-card border border-hairline bg-paper-3 px-3 text-[13.5px] text-ink placeholder:text-ink-300 transition-colors focus:border-marigold focus:outline-none';

export function TextInput({
  className = '',
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      className={`${controlBase} h-10 ${invalid ? 'border-surge' : ''} ${className}`}
    />
  );
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`${controlBase} h-10 appearance-none bg-[length:10px] pr-8 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237b8494' stroke-width='1.4'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${controlBase} py-2.5 leading-relaxed ${className}`} />;
}

/* ------------------------------------------------------------------ Tags */

export type TagTone = 'neutral' | 'marigold' | 'verdant' | 'surge' | 'sky' | 'road' | 'ink';

export function Tag({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: TagTone;
  className?: string;
}) {
  const tones: Record<TagTone, string> = {
    neutral: 'bg-paper-2 text-ink-500 border-hairline',
    marigold: 'bg-marigold-soft text-marigold border-marigold/25',
    verdant: 'bg-verdant-soft text-verdant border-verdant/25',
    surge: 'bg-surge-soft text-surge border-surge/25',
    sky: 'bg-sky-soft text-sky border-sky/25',
    road: 'bg-road-soft text-road border-road/25',
    ink: 'bg-ink text-paper border-ink',
  };
  return (
    <span
      className={`micro inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-[3px] whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'verdant', pulse = false }: { tone?: TagTone; pulse?: boolean }) {
  const colors: Record<TagTone, string> = {
    neutral: 'bg-ink-300',
    marigold: 'bg-marigold',
    verdant: 'bg-verdant',
    surge: 'bg-surge',
    sky: 'bg-sky',
    road: 'bg-road',
    ink: 'bg-ink',
  };
  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      <span className={`h-1.5 w-1.5 rounded-full ${colors[tone]} ${pulse ? 'animate-pulse-dot' : ''}`} />
    </span>
  );
}

/* ----------------------------------------------------------------- Meter */

export function TierMeter({
  pledged,
  total,
  gates,
  compact = false,
}: {
  pledged: number;
  total: number;
  gates: number[];
  compact?: boolean;
}) {
  const filled = total > 0 ? Math.min(1, pledged / total) : 0;
  return (
    <div className="w-full">
      <div
        className={`relative w-full overflow-hidden rounded-[2px] bg-paper-2 ring-1 ring-hairline-soft ring-inset ${
          compact ? 'h-1.5' : 'h-2'
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-500 ease-out"
          style={{ width: `${filled * 100}%` }}
        />
        {gates.map((gate) => {
          const at = total > 0 ? Math.min(1, gate / total) : 0;
          const passed = pledged >= gate;
          return (
            <span
              key={gate}
              className={`absolute inset-y-0 w-px ${passed ? 'bg-paper/60' : 'bg-marigold'}`}
              style={{ left: `${at * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Stat */

export function Stat({
  label,
  value,
  sub,
  tone = 'ink',
  className = '',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'ink' | 'marigold' | 'verdant' | 'surge' | 'paper';
  className?: string;
}) {
  const colors: Record<string, string> = {
    ink: 'text-ink',
    marigold: 'text-marigold',
    verdant: 'text-verdant',
    surge: 'text-surge',
    paper: 'text-paper',
  };
  return (
    <div className={className}>
      <p className="micro text-ink-400">{label}</p>
      <p className={`tnum font-display mt-1 text-[22px] leading-none font-medium ${colors[tone]}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11.5px] leading-snug text-ink-400">{sub}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[2px] bg-hairline-soft ${className}`} />;
}

/* ---------------------------------------------------------------- Toasts */

export interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: 'ok' | 'warn' | 'error';
}

interface ToastApi {
  push: (t: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastApi>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { ...t, id }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 6200);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-3 bottom-3 z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 sm:right-5 sm:bottom-5">
        {items.map((item) => {
          const tones = {
            ok: 'border-verdant/35 bg-paper-3',
            warn: 'border-marigold/40 bg-paper-3',
            error: 'border-surge/40 bg-paper-3',
          } as const;
          const bars = { ok: 'bg-verdant', warn: 'bg-marigold', error: 'bg-surge' } as const;
          return (
            <div
              key={item.id}
              role="status"
              className={`animate-rise pointer-events-auto flex overflow-hidden rounded-card border shadow-[0_10px_30px_-18px_rgba(11,14,20,0.55)] ${tones[item.tone]}`}
            >
              <span className={`w-[3px] shrink-0 ${bars[item.tone]}`} />
              <div className="px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-ink">{item.title}</p>
                {item.body ? (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{item.body}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/* ----------------------------------------------------------------- Misc */

export function KeyValue({
  k,
  v,
  mono = false,
  tone,
}: {
  k: string;
  v: ReactNode;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline-soft py-1.5 last:border-b-0">
      <span className="micro shrink-0 text-ink-400">{k}</span>
      <span className={`text-right text-[12.5px] ${mono ? 'tnum font-mono' : ''} ${tone ?? 'text-ink'}`}>
        {v}
      </span>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-card border border-hairline bg-paper-2 p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`micro h-7 rounded-[2px] px-2.5 transition-colors ${
              active ? 'bg-ink text-paper' : 'text-ink-500 hover:text-ink'
            }`}
          >
            {opt.label}
            {typeof opt.count === 'number' ? (
              <span className={`tnum ml-1.5 ${active ? 'text-paper/60' : 'text-ink-300'}`}>
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
