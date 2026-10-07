import React from 'react';
import { getActiveNetworkConfig, getNetworkConfig } from '@robex/config';
import type { NavTab } from '../../../components/Header.js';
import { EarnIcon, PoolIcon, SwapIcon } from '../../../components/icons.js';
import { useWallet } from '../../../wallet/wallet-context.js';

function shorten(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/**
 * Plan 002 scope: wallet + network status and quick actions only.
 * No balances, assets, portfolio value, positions or activity are shown here.
 */
export function ConnectedHome({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  const { state, account, walletName, isMockWallet } = useWallet();
  const active = getActiveNetworkConfig();
  const current = account ? getNetworkConfig(account.chainId) : undefined;
  const onActive = state === 'CONNECTED';
  const netLabel =
    state === 'WRONG_NETWORK' ? 'Wrong network' : state === 'UNSUPPORTED_NETWORK' ? 'Unsupported network' : 'Connected';

  return (
    <section className="rx-section" aria-labelledby="rx-status-title" data-testid="connected-home">
      <div className="rx-pv">
        <div>
          <div className="rx-eyebrow" id="rx-status-title">Wallet &amp; Network</div>
          {account && (
            <p className="rx-acct">
              <span className="num" data-testid="connected-address">{shorten(account.address)}</span>
              <span className="rx-chip">{isMockWallet ? 'Mock wallet' : walletName}</span>
            </p>
          )}
          <p className="rx-acct">
            <span className={`rx-chip ${onActive ? 'rx-chip-ok' : 'rx-chip-dev'}`} data-testid="network-status">
              {netLabel}
            </span>
            <span className="rx-chip num">
              {current?.chainName ?? 'Unknown chain'} · Chain {account?.chainId ?? '—'}
            </span>
          </p>
          {!onActive && (
            <p className="rx-muted">Switch to {active.chainName} (Chain ID {active.chainId}) to use Robex.</p>
          )}
        </div>
        <div className="rx-qa" aria-label="Quick actions">
          <button className="btn btn-primary" onClick={() => onNavigate('swap')}><SwapIcon /> Swap</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('pool')}><PoolIcon /> Add Liquidity</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('earn')}><EarnIcon /> Earn</button>
        </div>
      </div>
    </section>
  );
}
