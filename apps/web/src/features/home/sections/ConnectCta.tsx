import React from 'react';
import { useWallet } from '../../../wallet/wallet-context.js';

export function ConnectCta() {
  const { state, connectInjected, isMockWalletEnabled, connectMock, walletError } = useWallet();
  const busy = state === 'CONNECTING';

  return (
    <section className="rx-section" id="connect" aria-labelledby="rx-final-title">
      <div className="rx-final">
        <h2 id="rx-final-title">Ready to try Robex?</h2>
        <p>Connect a wallet to Robinhood Chain Testnet. Test tokens only — no real funds at risk.</p>
        <div className="rx-cta-row">
          <button className="btn btn-primary" disabled={busy} onClick={() => connectInjected().catch(() => undefined)}>
            {busy ? 'Connecting…' : 'Connect Wallet'}
          </button>
          {import.meta.env.DEV && isMockWalletEnabled && (
            <button className="btn btn-secondary rx-btn-dev" onClick={() => connectMock().catch(() => undefined)}>
              Dev Mock Wallet
            </button>
          )}
        </div>
        {walletError && <p className="rx-error" role="alert">{walletError}</p>}
      </div>
    </section>
  );
}
