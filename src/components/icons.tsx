import type { SVGProps } from 'react';

/**
 * Hand-drawn 1.4 px icon set on a 24-unit grid. Stroke inherits currentColor,
 * no fills — so icons tint with the text around them instead of fighting it.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlane = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.4 13.2 21 4.6a1.2 1.2 0 0 1 1.6 1.6L14 21.9a1 1 0 0 1-1.8-.3l-1.5-5.4-5.4-1.5a1 1 0 0 1-.3-1.8Z" />
    <path d="m10.7 16.2 4.2-4.2" />
  </Base>
);

export const IconBus = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 17V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V17" />
    <path d="M4 11h16M4 17h16M7.5 17v2.2M16.5 17v2.2" />
    <path d="M7.8 14.2h.01M16.2 14.2h.01" />
  </Base>
);

export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </Base>
);

export const IconBellOff = (p: IconProps) => (
  <Base {...p}>
    <path d="M8.7 4.9A6 6 0 0 1 18 9c0 2 .3 3.3.7 4.2M6.2 7.4C6 8 6 8.5 6 9c0 5-2 6-2 6h12" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    <path d="m3 3 18 18" />
  </Base>
);

export const IconArrow = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </Base>
);

export const IconArrowUpRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 17 17 7" />
    <path d="M8.5 7H17v8.5" />
  </Base>
);

export const IconChevron = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconMinus = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
    <circle cx="9.5" cy="7.5" r="3.2" />
    <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M16.4 4.6a3.2 3.2 0 0 1 0 6" />
  </Base>
);

export const IconRoute = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <path d="M8.4 18h5.1a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.6" />
  </Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3 1.8" />
  </Base>
);

export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.2 5 6v5.6c0 4.2 2.9 7.6 7 9.2 4.1-1.6 7-5 7-9.2V6Z" />
    <path d="m9.3 12 1.9 1.9 3.6-3.7" />
  </Base>
);

export const IconSpark = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
    <path d="M18.5 4.2v2.6M17.2 5.5h2.6" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-13.7-4.6L4 8.6" />
    <path d="M4 4.5v4.1h4.1" />
    <path d="M4 13a8 8 0 0 0 13.7 4.6L20 15.4" />
    <path d="M20 19.5v-4.1h-4.1" />
  </Base>
);

export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 6h17M6.5 12h11M10 18h4" />
  </Base>
);

export const IconTicket = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v1.5a2.6 2.6 0 0 0 0 5.2V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-3.3a2.6 2.6 0 0 0 0-5.2Z" />
    <path d="M12 8.2v1.4M12 12v1.4M12 15.8v.2" />
  </Base>
);

export const IconGauge = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 17a8.5 8.5 0 1 1 16 0" />
    <path d="m12 13.5 3.6-3.6" />
    <circle cx="12" cy="15" r="1.6" />
  </Base>
);

export const IconLuggage = (p: IconProps) => (
  <Base {...p}>
    <rect x="4.5" y="7.5" width="15" height="13" rx="1.8" />
    <path d="M9 7.5V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2v2.3" />
    <path d="M9.5 11.5v5M14.5 11.5v5" />
  </Base>
);

export const IconPin = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z" />
    <circle cx="12" cy="10.4" r="2.4" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.6" />
    <path d="m16 16 4.2 4.2" />
  </Base>
);

export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4.6 2.9 19.4h18.2Z" />
    <path d="M12 10v4.1M12 17.2h.01" />
  </Base>
);

export const IconHandshake = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 12.5 6 9h3l3 2.6 3-2.6h3l3.5 3.5" />
    <path d="M9 9 5.6 12.4a1.9 1.9 0 0 0 2.7 2.7l1.1-1.1 1.6 1.6a1.9 1.9 0 0 0 2.7-2.7" />
    <path d="m13.8 15.8 2 2M16 13.6l2 2" />
  </Base>
);

export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="6.6" height="6.6" rx="1" />
    <rect x="13.4" y="4" width="6.6" height="6.6" rx="1" />
    <rect x="4" y="13.4" width="6.6" height="6.6" rx="1" />
    <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1" />
  </Base>
);

export const IconTable = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="1.6" />
    <path d="M3.5 10h17M9.5 10v9" />
  </Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);
