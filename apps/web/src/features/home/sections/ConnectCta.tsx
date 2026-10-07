import React, { useState } from 'react';
import { useWallet } from '../../../wallet/wallet-context.js';

/**
 * Home wallet call-to-action. Keeps Plan 002 behaviour of the previous Home callout:
 * direct injected connect, optional dev mock connect, and a visible error notice.
 * `compact` is used while a wallet is attached on a wrong/unsupported network.
 */
export function ConnectCta({ compact = false }: { compact?: boolean }) {
  const { state, connectInjected, isMockWalletEnabled, connectMock } = useWallet();
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = state === 'CONNECTING';

  const handleConnectInjected = async () => {
    setActionError(null);
    try {
      await connectInjected();
    } catch (err) {
      setActionError((err as Error).message || 'Failed to connect browser wallet');
    }
  };

  const handleConnectMock = async () => {
    setActionError(null);
    try {
      await connectMock();
    } catch (err) {
      setActionError((err as Error).message || 'Failed to connect dev mock wallet');
    }
  };

  const buttons = (
    <div className="rx-cta-row">
      <button className="btn btn-primary" disabled={busy} onClick={handleConnectInjected}>
        {busy ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {isMockWalletEnabled && (
        <button className="btn btn-secondary rx-btn-dev" disabled={busy} onClick={handleConnectMock}>
          Dev Mock Wallet
        </button>
      )}
    </div>
  );
  const error = actionError && (
    <p className="rx-error" role="alert">Notice: {actionError}</p>
  );

  if (compact) {
    return (
      <section className="rx-section">
        <div className="callout rx-callout-compact">
          <span>Want to use a different wallet? Reconnect below.</span>
          {buttons}
          {error}
        </div>
      </section>
    );
  }

  return (
    <section className="rx-section" id="connect" aria-labelledby="rx-final-title">
      <div className="rx-final callout">
        <h2 id="rx-final-title">Ready to try Robex?</h2>
        <p>Connect a wallet to Robinhood Chain Testnet. Test tokens only — no real funds at risk.</p>
        {buttons}
        {error}
      </div>
    </section>
  );
}
