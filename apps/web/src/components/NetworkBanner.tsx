import React, { useState } from 'react';
import { useWallet } from '../wallet/wallet-context.js';
import { getActiveNetworkConfig, getNetworkConfig } from '@robex/config';

export function NetworkBanner() {
  const { state, account, switchToActiveNetwork, isMockWallet } = useWallet();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const activeNetwork = getActiveNetworkConfig();

  if (state !== 'WRONG_NETWORK' && state !== 'UNSUPPORTED_NETWORK') {
    return null;
  }

  const currentNetwork = account?.chainId ? getNetworkConfig(account.chainId) : null;
  const isWrong = state === 'WRONG_NETWORK';

  const handleSwitch = async () => {
    setSwitchError(null);
    setIsSwitching(true);
    try {
      await switchToActiveNetwork();
    } catch (err) {
      setSwitchError((err as Error).message || 'Failed to switch network');
    } finally {
      setIsSwitching(false);
    }
  };

  const mockQualifier = isMockWallet ? '[DEV MOCK Simulation] ' : '';

  return (
    <div
      className={`network-banner ${isWrong ? 'network-banner-warning' : 'network-banner-danger'}`}
      role="alert"
    >
      <div className="network-banner-inner">
        <div className="network-banner-content">
          <span className="network-banner-icon">{isWrong ? '⚠️' : '🚫'}</span>
          <div className="network-banner-text">
            <strong>{mockQualifier}{isWrong ? 'Wrong Network' : 'Unsupported Network'}: </strong>
            {isWrong
              ? `You are connected to ${currentNetwork?.chainName || `Chain ID ${account?.chainId}`}. Robex operates exclusively on ${activeNetwork.chainName}.`
              : `Chain ID ${account?.chainId} is not supported by Robex. Please switch to ${activeNetwork.chainName} (Chain ID ${activeNetwork.chainId}).`}
            {switchError && (
              <div style={{ color: 'var(--color-error)', marginTop: '4px', fontSize: 'var(--font-size-xs)' }}>
                Notice: {switchError}
              </div>
            )}
          </div>
        </div>
        <button
          className="btn btn-sm btn-primary network-banner-btn"
          onClick={handleSwitch}
          disabled={isSwitching}
        >
          {isSwitching ? 'Switching...' : `Switch to ${activeNetwork.chainName}`}
        </button>
      </div>
    </div>
  );
}
