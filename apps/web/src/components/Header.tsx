import React, { useEffect, useRef, useState } from 'react';
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
    walletName,
    hasInjectedProvider,
    discoveredProviders,
    legacyProviderAvailable,
    isMockWallet,
    isMockWalletEnabled,
    connectInjected,
    connectDiscovered,
    connectMock,
    disconnect,
    switchToActiveNetwork,
    walletError,
    clearWalletError,
    walletSelectorNonce,
  } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const seenSelectorNonce = useRef(0);

  useEffect(() => {
    if (walletSelectorNonce === 0 || walletSelectorNonce === seenSelectorNonce.current) return;
    seenSelectorNonce.current = walletSelectorNonce;
    clearWalletError();
    setIsModalOpen(true);
  }, [walletSelectorNonce, clearWalletError]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleConnectDiscovered = async (uuid: string) => {
    setConnectingId(uuid);
    try {
      await connectDiscovered(uuid);
      setIsModalOpen(false);
    } catch {
      // Error is captured in walletError state
    } finally {
      setConnectingId(null);
    }
  };

  const handleConnectLegacy = async () => {
    setConnectingId('legacy');
    try {
      await connectInjected();
      setIsModalOpen(false);
    } catch {
      // Error is captured in walletError state
    } finally {
      setConnectingId(null);
    }
  };

  const handleConnectMock = async () => {
    setConnectingId('mock');
    try {
      await connectMock();
      setIsModalOpen(false);
    } catch {
      // Error is captured in walletError state
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo-group">
            <div
              className="logo-text"
              onClick={() => onSelectTab('home')}
              style={{ cursor: 'pointer' }}
            >
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
            {state === 'CONNECTED' && account && (
              <div className="wallet-connected-group">
                {isMockWallet ? (
                  <span className="badge badge-mock" title="Development Simulated Wallet">
                    DEV MOCK
                  </span>
                ) : (
                  <span className="badge badge-injected" title={walletName}>
                    {walletName}
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
            )}

            {(state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK') && account && (
              <div className="wallet-connected-group">
                {isMockWallet ? (
                  <span className="badge badge-mock" title="Development Simulated Wallet">
                    DEV MOCK
                  </span>
                ) : (
                  <span className="badge badge-injected" title={walletName}>
                    {walletName}
                  </span>
                )}
                <span
                  className={`badge ${state === 'WRONG_NETWORK' ? 'badge-wrong-net' : 'badge-unsupported-net'}`}
                  title={state === 'WRONG_NETWORK' ? 'Connected to non-active network' : 'Connected to unsupported network'}
                >
                  {state === 'WRONG_NETWORK' ? 'Wrong Net' : 'Unsupported'}
                </span>
                <span className="wallet-address-pill">
                  {formatAddress(account.address)}
                </span>
                <button
                  className="btn btn-warning btn-switch-net"
                  onClick={async () => {
                    try {
                      await switchToActiveNetwork();
                    } catch {
                      // Shown by NetworkBanner from the shared walletError.
                    }
                  }}
                >
                  Switch Network
                </button>
                <button
                  className="btn btn-secondary btn-disconnect"
                  onClick={async () => {
                    try {
                      await disconnect();
                    } catch {
                      // Disconnect error handled
                    }
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}

            {state === 'CONNECTING' && (
              <button className="btn btn-secondary" disabled>
                Connecting...
              </button>
            )}

            {state === 'DISCONNECTED' && (
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
              {discoveredProviders.length > 0
                ? 'Choose the wallet you want Robex to use. Network and account events come only from that wallet.'
                : 'No EIP-6963 wallet was announced. You can use the legacy browser wallet, or the development mock when it is enabled.'}
            </p>

            {walletError && (
              <div
                className="callout callout-error"
                style={{ marginBottom: '16px', fontSize: 'var(--font-size-xs)' }}
              >
                <strong>Connection Error:</strong> {walletError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {discoveredProviders.map((entry) => (
                <button
                  key={entry.info.uuid}
                  className="btn btn-secondary wallet-option-btn"
                  onClick={() => handleConnectDiscovered(entry.info.uuid)}
                  disabled={connectingId !== null}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {entry.info.icon && (
                        <img src={entry.info.icon} alt="" width={20} height={20} style={{ borderRadius: '4px' }} />
                      )}
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {entry.info.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      EIP-6963{entry.info.rdns ? ` · ${entry.info.rdns}` : ''}
                    </div>
                  </div>
                  <span>{connectingId === entry.info.uuid ? 'Connecting...' : '→'}</span>
                </button>
              ))}

              {discoveredProviders.length === 0 && (
                <button
                  className="btn btn-secondary wallet-option-btn"
                  onClick={handleConnectLegacy}
                  disabled={connectingId !== null}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        Browser Wallet
                      </span>
                      {!legacyProviderAvailable && !hasInjectedProvider && (
                        <span className="badge badge-missing" style={{ fontSize: '10px' }}>
                          Not Detected
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      Legacy injected provider. EIP-6963 wallets were not announced.
                    </div>
                  </div>
                  <span>{connectingId === 'legacy' ? 'Connecting...' : '→'}</span>
                </button>
              )}

              {isMockWalletEnabled && (
                <button
                  className="btn btn-secondary wallet-option-btn"
                  onClick={handleConnectMock}
                  disabled={connectingId !== null}
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
                  <span>{connectingId === 'mock' ? 'Connecting...' : '→'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
