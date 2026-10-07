import React, { useState } from 'react';
import { useWallet } from '../../wallet/wallet-context.js';

export function PortfolioPage() {
  const { state, account, connect } = useWallet();
  const [subTab, setSubTab] = useState<'overview' | 'assets' | 'activity'>('overview');

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: '4px' }}>
          Portfolio Intelligence
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Unified non-custodial tracking across assets, liquidity, and activity
        </p>
      </div>

      {state !== 'CONNECTED' ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 className="card-title" style={{ marginBottom: '8px' }}>Wallet Not Connected</h2>
          <p className="card-subtitle" style={{ maxWidth: '440px', margin: '0 auto 24px auto' }}>
            Connect your wallet to analyze your token balances, liquidity pool shares, and transaction history on Robinhood Chain.
          </p>
          <button className="btn btn-primary" onClick={() => connect()}>
            Connect Testnet Wallet
          </button>
        </div>
      ) : (
        <div>
          {/* Sub Navigation */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {(['overview', 'assets', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                className={`btn ${subTab === tab ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSubTab(tab)}
                style={{ textTransform: 'capitalize' }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview Cards */}
          <div className="grid-3" style={{ marginBottom: '24px' }}>
            <div className="card">
              <div className="metric-label">Estimated Total Value</div>
              <div className="metric-large" style={{ marginTop: '8px' }}>$42,850.20</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Account: {account?.address.slice(0, 8)}...
              </div>
            </div>

            <div className="card">
              <div className="metric-label">Wallet Assets</div>
              <div className="metric-large" style={{ marginTop: '8px' }}>$35,420.00</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', marginTop: '4px' }}>
                82.6% Allocation
              </div>
            </div>

            <div className="card">
              <div className="metric-label">Pool & Earn Value</div>
              <div className="metric-large" style={{ marginTop: '8px' }}>$7,430.20</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-info)', marginTop: '4px' }}>
                17.4% Allocation
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '16px' }}>Assets on Robinhood Chain</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>Asset</th>
                    <th style={{ padding: '12px 16px' }}>Type</th>
                    <th style={{ padding: '12px 16px' }}>Balance</th>
                    <th style={{ padding: '12px 16px' }}>Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '16px', fontWeight: 600 }}>ETH</td>
                    <td style={{ padding: '16px' }}><span className="badge badge-testnet">NATIVE</span></td>
                    <td style={{ padding: '16px' }}>12.45 ETH</td>
                    <td style={{ padding: '16px' }}>$3,000.00</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>$37,350.00</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '16px', fontWeight: 600 }}>USDC</td>
                    <td style={{ padding: '16px' }}><span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)' }}>STABLECOIN</span></td>
                    <td style={{ padding: '16px' }}>5,500.20 USDC</td>
                    <td style={{ padding: '16px' }}>$1.00</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>$5,500.20</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
