import React, { useState } from 'react';
import { useWallet } from '../../wallet/wallet-context.js';

export function PortfolioPage() {
  const { state, account, connectInjected } = useWallet();
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnectError(null);
    try {
      await connectInjected();
    } catch (err) {
      setConnectError((err as Error).message || 'Failed to connect wallet');
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: '4px' }}>
          Portfolio Intelligence
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Unified non-custodial tracking across assets, liquidity, and activity
        </p>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: '36px', marginBottom: '16px' }}>📊</div>
        <h2 className="card-title" style={{ marginBottom: '8px' }}>
          Portfolio & Balance Intelligence Scheduled for Plan 003
        </h2>
        <p className="card-subtitle" style={{ maxWidth: '520px', margin: '0 auto 24px auto', lineHeight: 1.6 }}>
          Per Plan 002 security invariants, native ETH and ERC-20 token balance queries, portfolio valuations, and active asset position displays are strictly excluded until Plan 003.
        </p>

        {state === 'CONNECTED' && account ? (
          <div style={{ display: 'inline-block', backgroundColor: 'var(--bg-tertiary)', padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', fontFamily: 'monospace' }}>
            Connected Identity: {account.address}
          </div>
        ) : (
          <div>
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={state === 'CONNECTING'}
            >
              {state === 'CONNECTING' ? 'Connecting...' : 'Connect Testnet Wallet'}
            </button>
            {connectError && (
              <div style={{ color: 'var(--color-error)', marginTop: '8px', fontSize: 'var(--font-size-xs)' }}>
                Notice: {connectError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
