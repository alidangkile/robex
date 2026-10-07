import React from 'react';
import type { NavTab } from '../../components/Header.js';
import { useWallet } from '../../wallet/wallet-context.js';

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { state, connectInjected, isMockWalletEnabled, connectMock } = useWallet();

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 700, marginBottom: '8px' }}>
          Robinhood Chain DEX
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)', maxWidth: '640px' }}>
          Non-custodial trading, liquidity provision, and portfolio intelligence built natively for Robinhood Chain Testnet.
        </p>
      </div>

      <div className="callout callout-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <strong>Plan 002 Wallet & Network Mode:</strong> Injected wallet abstraction and network state active on Robinhood Chain Testnet (Chain ID 46630).
          Real account and chain detection enabled with wrong-network/unsupported-network handling.
        </div>
        {state !== 'CONNECTED' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => connectInjected()} style={{ padding: '6px 12px' }}>
              Connect Wallet
            </button>
            {isMockWalletEnabled && (
              <button className="btn btn-secondary" onClick={() => connectMock()} style={{ padding: '6px 12px', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                Dev Mock Wallet
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid-3" style={{ marginBottom: '32px' }}>
        <div className="card">
          <div className="card-header">
            <div className="metric-label">Core Feature</div>
            <h2 className="card-title">Token Swap</h2>
            <p className="card-subtitle">
              Aggregate quotes across native liquidity pools with minimal slippage and price impact protection.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => onNavigate('swap')} style={{ width: '100%' }}>
            Go to Swap
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="metric-label">Liquidity</div>
            <h2 className="card-title">Liquidity Pools</h2>
            <p className="card-subtitle">
              Supply token pairs to underlying protocol pools and manage liquidity positions transparently.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => onNavigate('pool')} style={{ width: '100%' }}>
            Explore Pools
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="metric-label">Yield & Portfolio</div>
            <h2 className="card-title">Earn & Portfolio</h2>
            <p className="card-subtitle">
              Track multi-asset balances, Stock Tokens normalization, and verifiable yield opportunities.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => onNavigate('portfolio')} style={{ width: '100%' }}>
            View Portfolio
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '12px' }}>Architecture & Security Guarantees</h3>
        <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: '1.8' }}>
          <li><strong>Non-custodial Architecture:</strong> User private keys never leave the browser or wallet.</li>
          <li><strong>Plan 002 Real Wallet Scope:</strong> Injected EVM wallet abstraction (standards-conformant EIP-1193) with wrong-network handling. Transaction execution and balance reads remain strictly disabled.</li>
          <li><strong>Stock Token Normalization:</strong> Centralized multiplier calculations protect financial accuracy.</li>
        </ul>
      </div>
    </div>
  );
}
