import React, { useState, useRef, useEffect } from 'react';
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inFlightRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // Visibility: Shown only when wallet connected, on 46630, and adapter has watchUsdgAsset.
  const isConnected = state === 'CONNECTED' && account !== null;
  const isOnTestnet = account?.chainId === UNISWAP_V4_TESTNET_QUOTE.chainId;
  const hasWatchUsdgAsset = typeof adapter?.watchUsdgAsset === 'function';

  const effectiveStatus: AddUsdgUiState = hasAdded ? 'added' : internalStatus;

  // UX-01: Move focus to the Copy button in unsupported state
  useEffect(() => {
    if (effectiveStatus === 'unsupported') {
      copyButtonRef.current?.focus();
    }
  }, [effectiveStatus]);

  if (!isConnected || !isOnTestnet || !hasWatchUsdgAsset) {
    return null;
  }

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
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(UNISWAP_V4_TESTNET_QUOTE.usdg);
      setCopyState('copied');
      copyTimerRef.current = setTimeout(() => {
        setCopyState('idle');
      }, 2000);
    } catch {
      setCopyState('failed');
      copyTimerRef.current = setTimeout(() => {
        setCopyState('idle');
      }, 3000);
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

      <span role="status" aria-live="polite">
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
              ref={copyButtonRef}
              type="button"
              data-testid="copy-usdg-address"
              className="add-usdg-copy-btn"
              onClick={handleCopy}
              aria-label="Copy USDG contract address"
            >
              {copyState === 'copied'
                ? 'Copied!'
                : copyState === 'failed'
                ? 'Copy failed — select the address'
                : 'Copy'}
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
    </span>
  );
}
