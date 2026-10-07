import React from 'react';

export function StaticHero({ onLaunchSwap }: { onLaunchSwap: () => void }) {
  return (
    <section className="rx-shero" aria-label="Robex introduction">
      <div className="rx-shero__copy">
        <div className="rx-shero__eyebrow">Non-custodial · Robinhood Chain Testnet</div>
        <h1 className="rx-shero__title">
          <span>Trade on-chain.</span>
          <span><em>Keep your keys.</em></span>
        </h1>
        <p className="rx-shero__lead">
          Designed for swap and liquidity from your own wallet. No custody, no sign-ups.
        </p>
        <div className="rx-shero__actions">
          <button type="button" className="btn btn-primary rx-shero__cta" onClick={onLaunchSwap}>
            Launch Swap <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
