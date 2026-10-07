import React from 'react';
import type { NavTab } from '../../../components/Header.js';
import { EarnIcon, PoolIcon, SwapIcon } from '../../../components/icons.js';
import { useWallet } from '../../../wallet/wallet-context.js';

function shorten(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function EmptyPanel({ title, body, testId }: { title: string; body: string; testId: string }) {
  return (
    <div className="rx-panel" data-testid={testId}>
      <h3>{title}</h3>
      <div className="rx-empty"><p>{body}</p></div>
    </div>
  );
}

export function ConnectedHome({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  const { account, isMockWallet } = useWallet();

  return (
    <section className="rx-section" aria-labelledby="rx-pv-title">
      <div className="rx-pv">
        <div>
          <div className="rx-eyebrow" id="rx-pv-title">Portfolio Value</div>
          {/* No portfolio indexing exists yet: show an honest empty value, never a fake balance. */}
          <div className="rx-pv-num num" data-testid="portfolio-value">—</div>
          <p className="rx-muted">
            Portfolio indexing is not live yet. Balances will appear here once on-chain data is connected.
          </p>
          {account && (
            <p className="rx-acct">
              <span className="num">{shorten(account.address)}</span>
              <span className="rx-chip num">Chain {account.chainId}</span>
              {isMockWallet && <span className="rx-chip rx-chip-dev">Mock wallet</span>}
            </p>
          )}
        </div>
        <div className="rx-qa" aria-label="Quick actions">
          <button className="btn btn-primary" onClick={() => onNavigate('swap')}><SwapIcon /> Swap</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('pool')}><PoolIcon /> Add Liquidity</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('earn')}><EarnIcon /> Earn</button>
        </div>
      </div>
      <div className="rx-panels">
        <EmptyPanel testId="empty-assets" title="Top Assets" body="No assets to show yet. Token balances will be listed here." />
        <EmptyPanel testId="empty-positions" title="Active Positions" body="No liquidity or staking positions yet." />
        <EmptyPanel testId="empty-activity" title="Recent Activity" body="No transactions yet. Your swaps and deposits will appear here." />
      </div>
    </section>
  );
}
