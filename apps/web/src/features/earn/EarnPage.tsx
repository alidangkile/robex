import React from 'react';

export function EarnPage() {
  const opportunities = [
    {
      id: 'earn-1',
      asset: 'ETH / USDC LP',
      source: 'Trading Fee Share',
      type: 'LIQUIDITY_FEES',
      apr: '--',
      risk: 'Strategy Shell',
    },
    {
      id: 'earn-2',
      asset: 'HOOD / ETH LP',
      source: 'Protocol Incentive Program',
      type: 'LIQUIDITY_INCENTIVE',
      apr: '--',
      risk: 'Strategy Shell',
    },
    {
      id: 'earn-3',
      asset: 'USDC Vault',
      source: 'Lending Protocol Supply',
      type: 'LENDING_SUPPLY',
      apr: '--',
      risk: 'Strategy Shell',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: '4px' }}>
          Earn & Yield
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Plan 001 Foundation Shell — Verifiable yield discovery planned for subsequent milestone
        </p>
      </div>

      <div className="grid-3" style={{ marginBottom: '24px' }}>
        {opportunities.map((opp) => (
          <div key={opp.id} className="card">
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  {opp.source}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  {opp.risk}
                </span>
              </div>
              <h2 className="card-title" style={{ marginTop: '12px' }}>{opp.asset}</h2>
              <p className="card-subtitle">Source: {opp.source}</p>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div className="metric-label">Estimated APR</div>
              <div className="metric-large" style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-2xl)' }}>
                {opp.apr}
              </div>
            </div>
            <button className="btn btn-secondary" disabled style={{ width: '100%', opacity: 0.6 }}>
              Available in Later Plan
            </button>
          </div>
        ))}
      </div>

      <div className="callout callout-info">
        <strong>Plan 001 Architecture Shell:</strong> Live APR calculations and reward contracts will be connected once the protocol layer is selected and audited. No simulated yields are presented as real.
      </div>
    </div>
  );
}
