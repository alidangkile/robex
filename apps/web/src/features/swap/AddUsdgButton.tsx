import React, { useState, useRef } from 'react';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { useWallet } from '../../wallet/wallet-context.js';
import type { WatchAssetResult } from '@robex/types';

export type AddUsdgUiState =
  | 'idle'
  | 'pending'
  | 'added'
  | 'declined'
  | 'unsupported'
  | 'wrong-network'
  | 'error';

export interface AddUsdgButtonProps {
  hasAdded?: boolean;
  onAdded?: () => void;
  className?: string;
}

export function AddUsdgButton({ hasAdded, onAdded, className }: AddUsdgButtonProps) {
  const { adapter, state, account } = useWallet();
  const [internalStatus, setInternalStatus] = useState<AddUsdgUiState>('idle');
  const [copied, setCopied] = useState(false);
  const inFlightRef = useRef(false);

  // Visibility: Shown only when wallet connected, on 46630, and adapter has watchUsdgAsset.
  const isConnected = state === 'CONNECTED' && account !== null;
  const isOnTestnet = account?.chainId === UNISWAP_V4_TESTNET_QUOTE.chainId;
  const hasWatchUsdgAsset = typeof adapter?.watchUsdgAsset === 'function';

  if (!isConnected || !isOnTestnet || !hasWatchUsdgAsset) {
    return null;
  }

  const effectiveStatus: AddUsdgUiState = hasAdded ? 'added' : internalStatus;

  const handleClick = async () => {
    if (inFlightRef.current || effectiveStatus === 'pending') {
      return;
    }
    if (!adapter.watchUsdgAsset) {
      return;
    }

    inFlightRef.current = true;
    setInternalStatus('pending');

    try {
      const result: WatchAssetResult = await adapter.watchUsdgAsset();
      if (result === 'added') {
        setInternalStatus('added');
        onAdded?.();
      } else if (result === 'declined') {
        setInternalStatus('declined');
      } else if (result === 'unsupported') {
        setInternalStatus('unsupported');
      } else if (result === 'wrong-network') {
        setInternalStatus('wrong-network');
      }
    } catch {
      setInternalStatus('error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(UNISWAP_V4_TESTNET_QUOTE.usdg);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const showButton =
    effectiveStatus === 'idle' ||
    effectiveStatus === 'pending' ||
    effectiveStatus === 'declined' ||
    effectiveStatus === 'error';

  return (
    <span className={`add-usdg-wrapper ${className || ''}`}>
      {showButton && (
        <button
          type="button"
          data-testid="add-usdg-button"
          className="add-usdg-btn"
          disabled={effectiveStatus === 'pending'}
          onClick={handleClick}
        >
          {effectiveStatus === 'pending' ? 'Check your wallet…' : '+ Add USDG to wallet'}
        </button>
      )}

      {effectiveStatus === 'added' && (
        <span data-testid="add-usdg-status" className="add-usdg-status add-usdg-status-success">
          USDG added to your wallet
        </span>
      )}

      {effectiveStatus === 'declined' && (
        <span data-testid="add-usdg-status" className="add-usdg-status add-usdg-status-neutral">
          Not added
        </span>
      )}

      {effectiveStatus === 'unsupported' && (
        <span data-testid="add-usdg-status" className="add-usdg-status add-usdg-status-unsupported">
          Your wallet can't add tokens automatically. Add it manually with this address:{' '}
          <code data-testid="usdg-address" className="add-usdg-address-code">
            {UNISWAP_V4_TESTNET_QUOTE.usdg}
          </code>
          <button
            type="button"
            data-testid="copy-usdg-address"
            className="add-usdg-copy-btn"
            onClick={handleCopy}
            aria-label="Copy USDG contract address"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </span>
      )}

      {effectiveStatus === 'wrong-network' && (
        <span data-testid="add-usdg-status" className="add-usdg-status add-usdg-status-warning">
          Switch to Robinhood Chain Testnet first
        </span>
      )}

      {effectiveStatus === 'error' && (
        <span data-testid="add-usdg-status" className="add-usdg-status add-usdg-status-neutral">
          Couldn't add USDG. Try again.
        </span>
      )}
    </span>
  );
}
