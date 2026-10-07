import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
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

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></Svg>
);
export const SwapIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 4v16l-3-3M17 20V4l3 3" /></Svg>
);
export const PoolIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></Svg>
);
export const EarnIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 18l5-6 4 3 7-9" /><path d="M15 6h5v5" /></Svg>
);
export const PortfolioIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M8 6V4h8v2" /></Svg>
);
export const WalletIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12h2" /></Svg>
);

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M6 26V6h11a6 6 0 0 1 0 12H11l10 8"
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="8" r="2.4" fill="var(--accent-secondary)" />
    </svg>
  );
}
