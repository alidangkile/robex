import React, { useState } from 'react';
import { useWallet } from '../../wallet/wallet-context.js';

export function PoolPage() {
  const { state, connect } = useWallet();
  const [tab, setTab] = useState<'explore' | 'positions'>('explore');

  const mockPools = [
    { pair: 'ETH / USDC', tvl: '$1,420,000', feeTier: '0.3%', apr: '12.4%', volume24h: '$320,000' },
    { pair: 'ETH / HOOD', tvl: '$890,000', feeTier: '0.3%', apr: '18.2%', volume24h: '$150,000' },
    { pair: 'USDC / USDT', tvl: '$2,100,000', feeTier: '0.05%', apr: '4.8%', volume24h: '$410,000' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: '4px' }}>
            Liquidity Pools
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Provide liquidity to earn trading fees on Robinhood Chain
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
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {mockPools.map((pool) => (
                  <tr key={pool.pair} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '16px', fontWeight: 600 }}>{pool.pair}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{pool.feeTier}</td>
                    <td style={{ padding: '16px' }}>{pool.tvl}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{pool.volume24h}</td>
                    <td style={{ padding: '16px', color: 'var(--color-success)', fontWeight: 600 }}>{pool.apr}</td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}>
                        Add Liquidity
                      </button>
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
                Connect to inspect your active liquidity positions on Robinhood Chain
              </p>
              <button className="btn btn-primary" onClick={() => connect()}>
                Connect Wallet
              </button>
            </div>
          ) : (
            <div>
              <h3 className="card-title" style={{ marginBottom: '8px' }}>No Active Positions</h3>
              <p className="card-subtitle" style={{ marginBottom: '20px' }}>
                You have not deposited liquidity into any Robinhood Chain pool yet.
              </p>
              <button className="btn btn-primary" onClick={() => setTab('explore')}>
                Explore Pools to Deposit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
