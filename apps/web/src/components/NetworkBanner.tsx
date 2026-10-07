import React from 'react';
import { useWallet } from '../wallet/wallet-context.js';
import { getActiveNetworkConfig, getNetworkConfig } from '@robex/config';

export function NetworkBanner() {
  const { state, account, switchToActiveNetwork } = useWallet();
  const activeNetwork = getActiveNetworkConfig();

  if (state !== 'WRONG_NETWORK' && state !== 'UNSUPPORTED_NETWORK') {
    return null;
  }

  const currentNetwork = account?.chainId ? getNetworkConfig(account.chainId) : null;
  const isWrong = state === 'WRONG_NETWORK';

  return (
    <div
      className={`network-banner ${isWrong ? 'network-banner-warning' : 'network-banner-danger'}`}
      role="alert"
    >
      <div className="network-banner-inner">
        <div className="network-banner-content">
          <span className="network-banner-icon">{isWrong ? '⚠️' : '🚫'}</span>
          <div className="network-banner-text">
            <strong>{isWrong ? 'Wrong Network' : 'Unsupported Network'}: </strong>
            {isWrong
              ? `You are connected to ${currentNetwork?.chainName || `Chain ID ${account?.chainId}`}. Robex operates exclusively on ${activeNetwork.chainName}.`
              : `Chain ID ${account?.chainId} is not supported by Robex. Please switch to ${activeNetwork.chainName} (Chain ID ${activeNetwork.chainId}).`}
          </div>
        </div>
        <button
          className="btn btn-sm btn-primary network-banner-btn"
          onClick={() => switchToActiveNetwork()}
        >
          Switch to {activeNetwork.chainName}
        </button>
      </div>
    </div>
  );
}
