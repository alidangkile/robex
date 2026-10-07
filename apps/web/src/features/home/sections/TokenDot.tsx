import React from 'react';

/** Token avatar dot. Color is per-token data, applied via CSS custom property. */
export function TokenDot({ sym, color }: { sym: string; color: string }) {
  return (
    <span className="rx-dot" style={{ '--dot-color': color } as React.CSSProperties} aria-hidden="true">
      {sym}
    </span>
  );
}
