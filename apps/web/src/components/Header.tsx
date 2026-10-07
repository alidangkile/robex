import React from 'react';
import { useWallet } from '../wallet/wallet-context.js';

export type NavTab = 'home' | 'swap' | 'pool' | 'earn' | 'portfolio';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function Header({ activeTab, onSelectTab }: HeaderProps) {
  const { state, account, connect, disconnect } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo-group">
          <div className="logo-text" onClick={() => onSelectTab('home')} style={{ cursor: 'pointer' }}>
            <span className="logo-accent">▲</span> ROBEX
          </div>
          <span className="badge badge-testnet">Robinhood Testnet</span>
        </div>

        <nav className="desktop-nav">
          <button
            className={`nav-link ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => onSelectTab('home')}
          >
            Home
          </button>
          <button
            className={`nav-link ${activeTab === 'swap' ? 'active' : ''}`}
            onClick={() => onSelectTab('swap')}
          >
            Swap
          </button>
          <button
            className={`nav-link ${activeTab === 'pool' ? 'active' : ''}`}
            onClick={() => onSelectTab('pool')}
          >
            Pool
          </button>
          <button
            className={`nav-link ${activeTab === 'earn' ? 'active' : ''}`}
            onClick={() => onSelectTab('earn')}
          >
            Earn
          </button>
          <button
            className={`nav-link ${activeTab === 'portfolio' ? 'active' : ''}`}
            onClick={() => onSelectTab('portfolio')}
          >
            Portfolio
          </button>
        </nav>

        <div className="header-actions">
          {state === 'CONNECTED' && account ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'monospace',
                }}
              >
                {formatAddress(account.address)}
              </span>
              <button className="btn btn-secondary" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => connect()}
              disabled={state === 'CONNECTING'}
            >
              {state === 'CONNECTING' ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
