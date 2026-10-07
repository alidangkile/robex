import React, { useState } from 'react';
import { useWallet } from '../wallet/wallet-context.js';

export type NavTab = 'home' | 'swap' | 'pool' | 'earn' | 'portfolio';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function Header({ activeTab, onSelectTab }: HeaderProps) {
  const {
    state,
    account,
    isMockWallet,
    isMockWalletEnabled,
    connectInjected,
    connectMock,
    disconnect,
    walletError,
    clearWalletError,
  } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectingType, setConnectingType] = useState<string | null>(null);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleConnectInjected = async () => {
    setConnectingType('INJECTED');
    try {
      await connectInjected();
      setIsModalOpen(false);
    } catch {
      // Error is stored in walletError state
    } finally {
      setConnectingType(null);
    }
  };

  const handleConnectMock = async () => {
    setConnectingType('MOCK');
    try {
      await connectMock();
      setIsModalOpen(false);
    } catch {
      // Error is stored in walletError state
    } finally {
      setConnectingType(null);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo-group">
            <div className="logo-text" onClick={() => onSelectTab('home')} style={{ cursor: 'pointer' }}>
              <span className="logo-accent">▲</span> ROBEX
            </div>
            <span className="badge badge-testnet header-testnet-badge">Testnet</span>
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
              <div className="wallet-connected-group">
                {/* Finding 2: Explicitly distinguish between Dev Mock and Real Injected wallet */}
                {isMockWallet ? (
                  <span className="badge badge-mock" title="Development Simulated Wallet">
                    DEV MOCK
                  </span>
                ) : (
                  <span className="badge badge-injected" title="Real Browser Injected Wallet">
                    INJECTED
                  </span>
                )}
                <span className="wallet-address-pill">
                  {formatAddress(account.address)}
                </span>
                <button
                  className="btn btn-secondary btn-disconnect"
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  clearWalletError();
                  setIsModalOpen(true);
                }}
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Wallet Connection Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="card-title">Select Wallet</h3>
              <button
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="card-subtitle" style={{ marginBottom: '16px' }}>
              Connect your browser wallet or select the development mock wallet for testing.
            </p>

            {walletError && (
              <div className="callout callout-error" style={{ marginBottom: '16px', fontSize: 'var(--font-size-xs)' }}>
                <strong>Connection Error:</strong> {walletError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-secondary wallet-option-btn"
                onClick={handleConnectInjected}
                disabled={connectingType !== null}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Browser Wallet (Injected)
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    MetaMask, Rabby, or other EIP-1193 extensions
                  </div>
                </div>
                <span>{connectingType === 'INJECTED' ? 'Connecting...' : '→'}</span>
              </button>

              {isMockWalletEnabled && (
                <button
                  className="btn btn-secondary wallet-option-btn"
                  onClick={handleConnectMock}
                  disabled={connectingType !== null}
                  style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-warning)' }}>
                      Dev Mock Wallet [DEVELOPMENT ONLY]
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      Simulated local wallet for UI/responsive testing
                    </div>
                  </div>
                  <span>{connectingType === 'MOCK' ? 'Connecting...' : '→'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
