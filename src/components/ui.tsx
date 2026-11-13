import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';
import { countdown, formatClockMs } from '../lib/format';
import { useIsoLayoutEffect } from '../lib/useIsoLayoutEffect';
import { useNow } from '../hooks/useClock';
import { IconAlert, IconCheck, IconClose, IconMinus, IconPlus, IconRefresh } from './icons';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** IntersectionObserver reveal. Falls back to visible if IO is unavailable. */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Component = Tag as 'div';
  const setRef = ref as unknown as Ref<HTMLDivElement>;

  return (
    <Component
      ref={setRef}
      data-shown={shown}
      className={cn('reveal', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-pill font-medium tracking-tight ' +
  'transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-out-expo ' +
  'select-none disabled:cursor-not-allowed disabled:opacity-45 active:translate-y-px whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-bright shadow-accent',
  secondary:
    'bg-sunken text-ink border border-edge hover:bg-hover hover:border-edge',
  ghost: 'text-ink-soft hover:text-ink hover:bg-raised border border-transparent',
  quiet: 'text-ink-muted hover:text-ink-soft hover:bg-hover border border-edge',
  danger: 'bg-ember-tint text-ember-deep border border-ember-line hover:bg-ember-tint-strong',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-10 px-4 text-[13.5px]',
  lg: 'h-12 px-6 text-[14.5px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  full?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  trailing,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], full && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon}
      <span className={cn(loading && 'opacity-70')}>{children}</span>
      {!loading && trailing}
    </button>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('animate-spin', className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.22" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Panel({
  children,
  className,
  as: Tag = 'div',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
  hover?: boolean;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-rule bg-surface/85 shadow-panel',
        hover &&
          'transition-[border-color,background-color,transform] duration-300 ease-out-expo hover:border-rule-strong hover:bg-raised',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('micro text-ink-muted', className)}>{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Chips & tones                                                              */
/* -------------------------------------------------------------------------- */

export type Tone = 'marigold' | 'jade' | 'ember' | 'lagoon' | 'clay' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  marigold: 'bg-accent-tint text-accent-deep border-accent-line',
  jade: 'bg-jade-tint text-jade-deep border-jade-line',
  ember: 'bg-ember-tint text-ember-deep border-ember-line',
  lagoon: 'bg-lagoon-tint text-lagoon-deep border-lagoon-line',
  clay: 'bg-clay-tint text-clay-deep border-clay-line',
  neutral: 'bg-sunken text-ink-soft border-rule-strong',
};

export function Chip({
  children,
  tone = 'neutral',
  className,
  dot = false,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 micro-md',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        >
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

/* `focus:outline-none` opts a field out of the global ring, so the focus
   indicator is the border and it has to clear 3:1 by itself: the bright accent
   at 70% over the field measured 1.70:1, which is a decoration where a state
   change was promised. `accent-deep` is 6.47:1 against the field. */
const FIELD_SHELL =
  'w-full rounded-card border bg-raised text-ink placeholder:text-ink-faint ' +
  'transition-[border-color,background-color,box-shadow] duration-200 ease-out-expo ' +
  'focus:outline-none focus:border-accent-deep focus:bg-sunken focus:shadow-ring-accent';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
  required,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="micro flex items-center justify-between gap-3 text-ink-muted"
      >
        <span>
          {label}
          {required && <span className="text-accent-deep"> *</span>}
        </span>
        {hint ? <span className="normal-case tracking-normal font-sans text-[11px]">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ember-deep">
          <IconAlert size={12} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  invalid,
  ...rest
}: ComponentPropsWithRef<'input'> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        FIELD_SHELL,
        'h-10 px-3 text-[13.5px]',
        invalid ? 'border-ember-deep' : 'border-edge',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function TextArea({
  className,
  invalid,
  ...rest
}: ComponentPropsWithRef<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        FIELD_SHELL,
        'px-3 py-2.5 text-[13.5px] leading-relaxed resize-y min-h-[84px]',
        invalid ? 'border-ember-deep' : 'border-edge',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function SelectInput({
  className,
  invalid,
  children,
  ...rest
}: ComponentPropsWithRef<'select'> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(
          FIELD_SHELL,
          'h-10 appearance-none pl-3 pr-9 text-[13.5px]',
          invalid ? 'border-ember-deep' : 'border-edge',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, Math.trunc(n) || min)),
    [min, max],
  );
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-rule bg-raised p-1',
        disabled && 'opacity-50',
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || atMin}
        onClick={() => onChange(clamp(value - 1))}
        className="grid h-8 w-8 place-items-center rounded-pill text-ink-soft transition-colors duration-200 hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <IconMinus size={14} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="tnum h-8 w-11 border-0 bg-transparent text-center text-[14px] font-medium text-ink focus:outline-none disabled:cursor-not-allowed"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || atMax}
        onClick={() => onChange(clamp(value + 1))}
        className="grid h-8 w-8 place-items-center rounded-pill text-ink-soft transition-colors duration-200 hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <IconPlus size={14} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill border border-rule bg-surface p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] transition-colors duration-200 ease-out-expo',
              active
                ? 'bg-hover text-ink shadow-tab-inset'
                : 'text-ink-muted hover:text-ink-soft',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Data display                                                               */
/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const valueTone =
    tone === 'jade'
      ? 'text-jade-deep'
      : tone === 'marigold'
        ? 'text-accent-deep'
        : tone === 'ember'
          ? 'text-ember-deep'
          : tone === 'lagoon'
            ? 'text-lagoon-deep'
            : 'text-ink';
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="micro text-ink-faint">{label}</span>
      <span className={cn('tnum text-[22px] leading-none font-medium tracking-tight', valueTone)}>
        {value}
      </span>
      {sub ? <span className="text-[11.5px] leading-snug text-ink-muted">{sub}</span> : null}
    </div>
  );
}

/**
 * Fill meter. The track is the carrier's allotment; the fill is pledged seats.
 *
 * A progress bar is a graphic, so WCAG 1.4.11 applies to it twice: the reader has
 * to see where the bar is, and how full it is. Two measurements set these colours.
 * The track is a `sunken` well with an `edge` outline, because the outline is the
 * only thing that says "this is a bar" — a track that differs from its card by
 * 1.15:1 is a smudge, and `edge` clears 3.31–3.99:1 against every surface it can
 * sit on. The fill takes a cut that clears 3:1 against both the track and the
 * page: bright marigold measured 1.63:1 against the old track and 1.96:1 against
 * the page, so the most common meter on the board was a bar nobody could see
 * filling. Marigold as a *graphic* now follows the rule marigold as *type* already
 * did, and takes the deep cut.
 *
 * The three tier ticks this used to draw are gone rather than re-cut. Their labels
 * only ever existed in a `title` attribute, which a phone cannot open, so the one
 * thing a traveller has to understand about a corridor — how far it is from the
 * next price break — was the one thing they could not read. `<TierLadder compact>`
 * says it in words and rupees instead.
 */
export function Meter({
  filled,
  total,
  tone = 'marigold',
  className,
  label,
}: {
  filled: number;
  total: number;
  tone?: 'marigold' | 'jade' | 'lagoon';
  className?: string;
  label?: string;
}) {
  const ratio = total > 0 ? Math.min(100, (filled / total) * 100) : 0;
  const barTone =
    tone === 'jade' ? 'bg-jade' : tone === 'lagoon' ? 'bg-lagoon' : 'bg-accent-deep';

  return (
    <div className={cn('w-full', className)}>
      <div
        className="relative h-2 w-full overflow-hidden rounded-pill border border-edge bg-sunken"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(filled, total)}
        aria-label={label ?? 'Seats pledged against allotment'}
      >
        <div
          className={cn('h-full rounded-pill transition-[width] duration-500 ease-out-expo', barTone)}
          style={{ width: `${ratio}%` }}
        />
      </div>
    </div>
  );
}

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (!label) return <div className={cn('h-px w-full bg-rule-strong', className)} />;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-rule-strong" />
      <span className="micro text-ink-faint">{label}</span>
      <span className="h-px flex-1 bg-rule-strong" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-card bg-sunken', className)} aria-hidden="true">
      <span className="sheen animate-sweep absolute inset-0" />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  as: Heading = 'h3',
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  /**
   * Where this sits in the page's heading outline. It is often the only heading
   * a filtered-empty or unknown-route page has, so the caller names the level:
   * h1 when it *is* the page title, h2 when it follows one, h3 inside a section.
   * axe's heading-order rule fails the build otherwise — and a screen-reader
   * user navigating by heading lands somewhere different from what they see.
   */
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-rule-strong bg-surface/40 px-6 py-12 text-center">
      {icon ? <span className="text-ink-faint">{icon}</span> : null}
      <div className="flex flex-col gap-1.5">
        <Heading className="display text-[22px] text-ink">{title}</Heading>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-ink-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'The ledger is unreachable',
  body,
  onRetry,
  retrying,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-ember-line bg-ember-tint/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <IconAlert size={16} className="mt-0.5 shrink-0 text-ember-deep" />
        <div className="flex flex-col gap-1">
          <p className="text-[13.5px] font-medium text-ember-deep">{title}</p>
          <p className="max-w-xl text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
        </div>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying} icon={<IconRefresh size={13} />}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-70 flex flex-col items-center gap-2 px-4 pb-5 sm:items-end sm:px-6"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const tone =
          toast.tone === 'success'
            ? 'border-jade-line bg-jade-tint text-jade-deep'
            : toast.tone === 'error'
              ? 'border-ember-line bg-ember-tint text-ember-deep'
              : 'border-rule-strong bg-sunken text-ink-soft';
        return (
          <div
            key={toast.id}
            className={cn(
              'animate-sheet pointer-events-auto flex max-w-md items-start gap-2.5 rounded-card border px-3.5 py-2.5 shadow-lift backdrop-blur-md',
              tone,
            )}
            role="status"
            aria-live="polite"
          >
            <span className="mt-px shrink-0">
              {toast.tone === 'success' ? <IconCheck size={14} /> : toast.tone === 'error' ? <IconAlert size={14} /> : <IconRefresh size={14} />}
            </span>
            <p className="flex-1 text-[12.5px] leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-pill p-0.5 text-current opacity-55 transition-opacity duration-200 hover:opacity-100"
            >
              <IconClose size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** useToasts: appends a toast and auto-dismisses it. Ids are monotonic. */
export function useToasts(timeout = 4600) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      seq.current += 1;
      const id = seq.current;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), timeout);
    },
    [dismiss, timeout],
  );

  return { toasts, push, dismiss };
}

/* -------------------------------------------------------------------------- */
/* Clock leaves                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Live countdown. This is the only component that re-renders every second, so a
 * grid of cards can each carry one without the grid re-rendering with them.
 */
export function Countdown({
  iso,
  className,
  closedLabel = 'closed',
  suffix,
}: {
  iso: string;
  className?: string;
  closedLabel?: string;
  suffix?: string;
}) {
  const now = useNow();
  const text = countdown(iso, now);
  return (
    <time className={cn('tnum', className)} dateTime={iso}>
      {text === 'closed' ? closedLabel : text}
      {suffix}
    </time>
  );
}

/** Ticking IST wall clock, for "synced at" stamps. */
export function ClockStamp({ className }: { className?: string }) {
  const now = useNow();
  return <span className={cn('tnum', className)}>{formatClockMs(now)}</span>;
}

/* -------------------------------------------------------------------------- */
/* Sheet (accessible modal)                                                   */
/* -------------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useIsoLayoutEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const labelId = useMemo(() => titleId.replace(/:/g, ''), [titleId]);
  const describedId = useMemo(() => descId.replace(/:/g, ''), [descId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade absolute inset-0 bg-page/80 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={description ? describedId : undefined}
        tabIndex={-1}
        className={cn(
          'animate-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[10px] border border-rule-strong bg-surface shadow-lift sm:rounded-card',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id={labelId} className="display text-[21px] leading-tight text-ink">
              {title}
            </h2>
            {description ? (
              <p id={describedId} className="text-[12.5px] leading-snug text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-pill text-ink-muted transition-colors duration-200 hover:bg-sunken hover:text-ink"
          >
            <IconClose size={15} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="border-t border-rule bg-page/40 px-5 py-3.5">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Keyboard hint                                                              */
/* -------------------------------------------------------------------------- */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-rule-strong bg-sunken px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink-muted">
      {children}
    </kbd>
  );
}
