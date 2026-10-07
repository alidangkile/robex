import React, { useState, useEffect } from 'react';
import type { Quote } from '@robex/types';
import { useWallet } from '../../wallet/wallet-context.js';
import { getActiveNetworkConfig } from '@robex/config';

function formatBaseUnits(baseUnits: string, decimals = 6): string {
  try {
    const b = BigInt(baseUnits);
    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = b / divisor;
    const remainder = b % divisor;
    const remainderStr = remainder.toString().padStart(decimals, '0').slice(0, 2);
    return `${integerPart.toLocaleString('en-US')}.${remainderStr}`;
  } catch {
    return baseUnits;
  }
}

export function SwapPage() {
  const { state, account, connectInjected, switchToActiveNetwork, invalidationVersion } = useWallet();
  const [payAmount, setPayAmount] = useState('1');
  const [slippage, setSlippage] = useState(0.5);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeNetwork = getActiveNetworkConfig();

  // Call the real Quote path: Feature -> Service -> Adapter -> Provider
  // MEDIUM 2 Fix: Invalidate and clear quote immediately on identity/network change,
  // reset loading state, and discard delayed responses.
  useEffect(() => {
    let isCancelled = false;

    // Immediately clear old quote and action errors so stale identity data is never rendered
    setQuote(null);
    setActionError(null);

    if (state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK') {
      setLoadingQuote(false);
      setQuoteError('Quotes unavailable on non-active networks. Please switch to Robinhood Chain Testnet.');
      return;
    }

    if (state === 'DISCONNECTED' || !account) {
      setLoadingQuote(false);
      setQuoteError(null);
      return;
    }

    if (!payAmount || parseFloat(payAmount) <= 0) {
      setLoadingQuote(false);
      setQuoteError(null);
      return;
    }

    setLoadingQuote(true);
    setQuoteError(null);

    async function fetchQuote() {
      try {
        const amountWei = BigInt(Math.floor(parseFloat(payAmount) * 1e18)).toString();
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

        const res = await fetch(
          `${apiUrl}/api/v1/quote?amountIn=${amountWei}&slippage=${slippage}&chainId=${activeNetwork.chainId}`
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `API returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!isCancelled) {
          setQuote(data.quote);
        }
      } catch (err) {
        if (!isCancelled) {
          setQuote(null);
          setQuoteError(
            `Quote Service Unavailable: ${(err as Error).message}. Start backend API (npm run dev:api) to test the Feature -> Service -> Adapter -> Provider call path.`
          );
        }
      } finally {
        if (!isCancelled) {
          setLoadingQuote(false);
        }
      }
    }

    fetchQuote();

    return () => {
      isCancelled = true;
      setLoadingQuote(false);
    };
  }, [payAmount, slippage, activeNetwork.chainId, state, account?.address, invalidationVersion]);

  const handleConnect = async () => {
    setActionError(null);
    try {
      await connectInjected();
    } catch (err) {
      setActionError((err as Error).message || 'Failed to connect wallet');
    }
  };

  const handleSwitchNetwork = async () => {
    setActionError(null);
    try {
      await switchToActiveNetwork();
    } catch (err) {
      setActionError((err as Error).message || 'Failed to switch network');
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Swap</h2>
            <p className="card-subtitle">Plan 002 Real Wallet & Network State</p>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[0.1, 0.5, 1.0].map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: slippage === s ? 'var(--bg-tertiary)' : 'transparent',
                  color: slippage === s ? 'var(--accent-primary)' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/* You Pay Section - LOW 2 Fix: Removed Balance: -- placeholders */}
        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>You pay</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.0"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-2xl)',
                fontWeight: 700,
                width: '60%',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-full)' }}>
              <span>ETH</span>
            </div>
          </div>
        </div>

        {/* Swap Arrow Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            ↓
          </div>
        </div>

        {/* You Receive Section - LOW 2 Fix: Removed Balance: -- placeholders */}
        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginTop: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>You receive</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {loadingQuote ? 'Calculating...' : (quote ? formatBaseUnits(quote.expectedAmountOut, 6) : '--')}
              </div>
              {quote && (
                <span className="badge badge-mock" style={{ fontSize: '10px' }}>
                  SIMULATED
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-full)' }}>
              <span>USDC</span>
            </div>
          </div>
        </div>

        {/* Explicit Provider Error State (No silent fallback) */}
        {quoteError && (
          <div className="callout callout-warning" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '16px' }}>
            {quoteError}
          </div>
        )}

        {/* Action Error State (MEDIUM 1 Fix: Explicit visible action error notice) */}
        {actionError && (
          <div className="callout callout-error" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '16px' }}>
            <strong>Action Notice:</strong> {actionError}
          </div>
        )}

        {/* Quote Details (Verified architecture call path) */}
        {quote && (
          <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Quote Source</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {quote.source.name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Minimum received ({slippage}% slippage)</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {formatBaseUnits(quote.minimumAmountOut, 6)} USDC
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Simulated Price Impact</span>
              <span style={{ color: quote.priceImpactPercent > 1 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {quote.priceImpactPercent}%
              </span>
            </div>
          </div>
        )}

        {/* Primary CTA */}
        {state === 'DISCONNECTED' && (
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            style={{ width: '100%', minHeight: '48px', fontSize: 'var(--font-size-base)' }}
          >
            Connect Wallet
          </button>
        )}
        {state === 'CONNECTING' && (
          <button
            className="btn btn-secondary"
            disabled
            style={{ width: '100%', minHeight: '48px', fontSize: 'var(--font-size-base)' }}
          >
            Connecting Wallet...
          </button>
        )}
        {(state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK') && (
          <button
            className="btn btn-warning"
            onClick={handleSwitchNetwork}
            style={{ width: '100%', minHeight: '48px', fontSize: 'var(--font-size-base)' }}
          >
            Switch to {activeNetwork.chainName}
          </button>
        )}
        {state === 'CONNECTED' && (
          <button
            className="btn btn-secondary"
            disabled={true}
            style={{ width: '100%', minHeight: '48px', fontSize: 'var(--font-size-base)', opacity: 0.7, cursor: 'not-allowed' }}
          >
            Swap Execution Available in Later Plan
          </button>
        )}
      </div>
    </div>
  );
}
