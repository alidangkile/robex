import React, { useState } from 'react';
import { useWallet } from '../../wallet/wallet-context.js';

export function PoolPage() {
  const { state, connect } = useWallet();
  const [tab, setTab] = useState<'explore' | 'positions'>('explore');
  const [actionError, setActionError] = useState<string | null>(null);

  const handleConnect = async () => {
    setActionError(null);
    try {
      await connect();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Failed to connect wallet';
      setActionError(message);
    }
  };

  const supportedPairs = [
    { pair: 'ETH / USDC', feeTier: '0.3%', tvl: '--', apr: '--', volume24h: '--' },
    { pair: 'ETH / HOOD', feeTier: '0.3%', tvl: '--', apr: '--', volume24h: '--' },
    { pair: 'USDC / USDT', feeTier: '0.05%', tvl: '--', apr: '--', volume24h: '--' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: '4px' }}>
            Liquidity Pools
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Plan 001 Foundation Shell — Liquidity pool protocol integration planned for later milestone
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${tab === 'explore' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('explore')}
          >
            Explore Pools
          </button>
          <button
            className={`btn ${tab === 'positions' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('positions')}
          >
            My Positions
          </button>
        </div>
      </div>

      {tab === 'explore' ? (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Pool Pair</th>
                  <th style={{ padding: '12px 16px' }}>Fee Tier</th>
                  <th style={{ padding: '12px 16px' }}>TVL</th>
                  <th style={{ padding: '12px 16px' }}>24h Volume</th>
                  <th style={{ padding: '12px 16px' }}>APR</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {supportedPairs.map((pool) => (
                  <tr key={pool.pair} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '16px', fontWeight: 600 }}>{pool.pair}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{pool.feeTier}</td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{pool.tvl}</td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{pool.volume24h}</td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{pool.apr}</td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        Shell
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          {state !== 'CONNECTED' ? (
            <div>
              <h3 className="card-title" style={{ marginBottom: '8px' }}>Connect Your Wallet</h3>
              <p className="card-subtitle" style={{ marginBottom: '20px' }}>
                Connect to inspect liquidity positions on Robinhood Chain
              </p>
              {actionError && (
                <div
                  className="callout callout-error"
                  role="alert"
                  style={{ fontSize: 'var(--font-size-xs)', marginBottom: '16px', textAlign: 'left' }}
                >
                  <strong>Action Notice:</strong> {actionError}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={state === 'CONNECTING'}
              >
                {state === 'CONNECTING' ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            <div>
              <h3 className="card-title" style={{ marginBottom: '8px' }}>Position Management Shell</h3>
              <p className="card-subtitle" style={{ marginBottom: '20px' }}>
                On-chain position discovery and liquidity actions will be enabled once protocol adapters are integrated.
              </p>
              <button className="btn btn-secondary" disabled style={{ opacity: 0.6 }}>
                Deposit Available in Later Plan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
