import React from 'react';

export function EarnPage() {
  const opportunities = [
    {
      id: 'earn-1',
      asset: 'ETH / USDC LP',
      source: 'Trading Fee Share',
      type: 'LIQUIDITY_FEES',
      apr: '12.4%',
      risk: 'Low-Medium',
      verified: true,
    },
    {
      id: 'earn-2',
      asset: 'HOOD / ETH LP',
      source: 'Protocol Incentive Program',
      type: 'LIQUIDITY_INCENTIVE',
      apr: '18.2%',
      risk: 'Medium',
      verified: true,
    },
    {
      id: 'earn-3',
      asset: 'USDC Vault',
      source: 'Lending Protocol Supply',
      type: 'LENDING_SUPPLY',
      apr: '5.1%',
      risk: 'Low',
      verified: true,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: '4px' }}>
          Earn & Yield
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Transparent yield opportunities with verifiable source attribution
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
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
                  Risk: {opp.risk}
                </span>
              </div>
              <h2 className="card-title" style={{ marginTop: '12px' }}>{opp.asset}</h2>
              <p className="card-subtitle">Source: {opp.source}</p>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div className="metric-label">Estimated APR</div>
              <div className="metric-large" style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-2xl)' }}>
                {opp.apr}
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}>
              View Strategy
            </button>
          </div>
        ))}
      </div>

      <div className="callout callout-info">
        <strong>Yield Transparency:</strong> APR values represent estimated annualized returns derived from protocol fees and incentive schedules. Returns vary dynamically based on volume and liquidity depth.
      </div>
    </div>
  );
}
