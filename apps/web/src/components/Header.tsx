import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getActiveNetworkConfig } from '@robex/config';
import { useWallet } from '../wallet/wallet-context.js';
import { CopyIcon, DisconnectIcon, ExternalLinkIcon, LogoMark, WalletIcon } from './icons.js';

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'swap', label: 'Swap' },
  { id: 'pool', label: 'Pool' },
  { id: 'earn', label: 'Earn' },
  { id: 'portfolio', label: 'Portfolio' },
];

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
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const seenSelectorNonce = useRef(0);
  const activeNetwork = getActiveNetworkConfig();

  useEffect(() => {
    if (!isWalletMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setIsWalletMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isWalletMenuOpen]);

  const handleCopyAddress = async () => {
    if (!account?.address) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(account.address);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (walletSelectorNonce === 0 || walletSelectorNonce === seenSelectorNonce.current) return;
    seenSelectorNonce.current = walletSelectorNonce;
    clearWalletError();
    setIsModalOpen(true);
  }, [walletSelectorNonce, clearWalletError]);

  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const nav = navRef.current;
      const el = nav?.querySelector<HTMLElement>('.nav-link.active');
      if (!nav || !el || el.offsetWidth === 0) {
        setIndicator(null);
        return;
      }
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [activeTab]);

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
              aria-label="Robex home"
            >
              <LogoMark size={26} />
              <span className="logo-word">ROBEX</span>
            </div>
            <span className="badge badge-testnet header-testnet-badge">
              <i className="badge-dot" aria-hidden="true" />
              Testnet
            </span>
          </div>

          <nav className="desktop-nav" ref={navRef}>
            {indicator && (
              <span
                className="nav-indicator"
                aria-hidden="true"
                style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
              />
            )}
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => onSelectTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="header-actions">
            {account && (state === 'CONNECTED' || state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK') && (
              <div className="wallet-connected-group">
                <div className="network-chip" data-testid="network-chip" title={activeNetwork.chainName}>
                  <i
                    className={`network-status-dot ${state === 'CONNECTED' ? 'network-status-dot--connected' : 'network-status-dot--warning'}`}
                    aria-hidden="true"
                  />
                  <span className="network-chip-name">{activeNetwork.chainName}</span>
                </div>

                {(state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK') && (
                  <>
                    <span
                      className={`badge ${state === 'WRONG_NETWORK' ? 'badge-wrong-net' : 'badge-unsupported-net'}`}
                      title={state === 'WRONG_NETWORK' ? 'Connected to non-active network' : 'Connected to unsupported network'}
                    >
                      {state === 'WRONG_NETWORK' ? 'Wrong Net' : 'Unsupported'}
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
                  </>
                )}

                <div className="wallet-menu-container" ref={walletMenuRef}>
                  <button
                    type="button"
                    className="wallet-address-pill"
                    data-testid="wallet-address-button"
                    onClick={() => setIsWalletMenuOpen((open) => !open)}
                    aria-expanded={isWalletMenuOpen}
                    aria-haspopup="true"
                  >
                    <i className="wallet-dot" aria-hidden="true" />
                    <span>{formatAddress(account.address)}</span>
                    <span className="wallet-caret" aria-hidden="true">▾</span>
                  </button>

                  <div
                    className={`wallet-menu-dropdown ${isWalletMenuOpen ? 'wallet-menu-dropdown--open' : ''}`}
                    data-testid="wallet-menu-dropdown"
                    style={{ display: isWalletMenuOpen ? 'flex' : 'none' }}
                  >
                    <div className="wallet-menu-header">
                      <span className="wallet-menu-label">Connected Wallet</span>
                      <span className="wallet-menu-name" data-testid="wallet-menu-name">
                        {isMockWallet ? 'DEV MOCK' : walletName}
                      </span>
                    </div>
                    <div className="wallet-menu-divider" />
                    <button
                      type="button"
                      className="wallet-menu-item"
                      data-testid="wallet-menu-copy"
                      onClick={handleCopyAddress}
                    >
                      <CopyIcon size={14} />
                      <span>{copied ? 'Copied!' : 'Copy address'}</span>
                    </button>
                    <a
                      className="wallet-menu-item"
                      data-testid="wallet-menu-explorer"
                      href={`${activeNetwork.providers.explorerUrl.replace(/\/+$/, '')}/address/${account.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsWalletMenuOpen(false)}
                    >
                      <ExternalLinkIcon size={14} />
                      <span>View on explorer</span>
                    </a>
                    <div className="wallet-menu-divider" />
                    <button
                      type="button"
                      className="wallet-menu-item wallet-menu-item--danger btn-disconnect"
                      data-testid="wallet-menu-disconnect"
                      onClick={async () => {
                        setIsWalletMenuOpen(false);
                        try {
                          await disconnect();
                        } catch {
                          // Disconnect error handled
                        }
                      }}
                    >
                      <DisconnectIcon size={14} />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {state === 'CONNECTING' && (
              <button className="btn btn-secondary" disabled>
                Connecting...
              </button>
            )}

            {state === 'DISCONNECTED' && (
              <button
                className="btn btn-primary btn-connect"
                onClick={() => {
                  clearWalletError();
                  setIsModalOpen(true);
                }}
              >
                <WalletIcon size={16} />
                <span>Connect Wallet</span>
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
              Choose a wallet to connect to Robex.
            </p>

            {discoveredProviders.length === 0 && (
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                No wallet extension detected. Please install a browser wallet to connect to Robex.
              </p>
            )}

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
                      <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>
                        Detected
                      </span>
                    </div>
                    {import.meta.env.DEV && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        EIP-6963{entry.info.rdns ? ` · ${entry.info.rdns}` : ''}
                      </div>
                    )}
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
                      {legacyProviderAvailable ? (
                        <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>
                          Detected
                        </span>
                      ) : (
                        <span className="badge badge-missing" style={{ fontSize: '10px', padding: '2px 6px' }}>
                          Not Detected
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      Legacy injected provider
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
