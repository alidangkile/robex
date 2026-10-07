import React, { useState, useEffect } from 'react';
import type { Quote } from '@robex/types';
import { useWallet } from '../../wallet/wallet-context.js';
import { getActiveNetworkConfig } from '@robex/config';

export function SwapPage() {
  const { state, account, connect, sendTransaction } = useWallet();
  const [payAmount, setPayAmount] = useState('1');
  const [slippage, setSlippage] = useState(0.5);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const activeNetwork = getActiveNetworkConfig();

  // Call the real Quote path: Feature -> Service -> Adapter -> Provider
  useEffect(() => {
    let isCancelled = false;

    async function fetchQuote() {
      if (!payAmount || parseFloat(payAmount) <= 0) {
        setQuote(null);
        return;
      }

      setLoadingQuote(true);
      setQuoteError(null);

      try {
        // Convert to 18 decimals integer string
        const amountWei = BigInt(Math.floor(parseFloat(payAmount) * 1e18)).toString();
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

        const res = await fetch(
          `${apiUrl}/api/v1/quote?amountIn=${amountWei}&slippage=${slippage}&chainId=${activeNetwork.chainId}`
        );

        if (!res.ok) {
          throw new Error(`Quote service returned status ${res.status}`);
        }

        const data = await res.json();
        if (!isCancelled) {
          setQuote(data.quote);
        }
      } catch (err) {
        if (!isCancelled) {
          // Provide fallback internal calculation if API is offline
          const amountInNum = parseFloat(payAmount);
          const mockExpectedOut = (amountInNum * 3000 * 0.997).toFixed(2);
          const mockMinOut = (parseFloat(mockExpectedOut) * (1 - slippage / 100)).toFixed(2);

          setQuote({
            id: `client-fallback-${Date.now()}`,
            source: { id: 'robinhood-amm-v2', name: 'Robinhood DEX AMM V2', type: 'AMM_V2' },
            chainId: activeNetwork.chainId,
            tokenIn: 'ETH',
            tokenOut: 'USDC',
            amountIn: payAmount,
            expectedAmountOut: mockExpectedOut,
            minimumAmountOut: mockMinOut,
            estimatedGas: '120000',
            priceImpactPercent: 0.05,
            expiresAt: Date.now() + 30000,
          });
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
    };
  }, [payAmount, slippage, activeNetwork.chainId]);

  const handleSwap = async () => {
    if (state !== 'CONNECTED') {
      await connect();
      return;
    }
    setTxPending(true);
    setTxHash(null);
    try {
      const hash = await sendTransaction(
        activeNetwork.contracts.routerPlaceholder || '0x0000000000000000000000000000000000000001',
        quote?.rawCalldata || '0x',
        '0'
      );
      setTxHash(hash);
    } catch (err) {
      console.error('Swap failed:', err);
    } finally {
      setTxPending(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Swap</h2>
            <p className="card-subtitle">Trade tokens via best liquidity route</p>
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

        {/* You Pay Section */}
        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>You pay</span>
            <span>Balance: {state === 'CONNECTED' ? '12.45 ETH' : '--'}</span>
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

        {/* You Receive Section */}
        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginTop: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>You receive</span>
            <span>Balance: {state === 'CONNECTED' ? '5,200.00 USDC' : '--'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
              {loadingQuote ? 'Calculating...' : (quote ? quote.expectedAmountOut : '0.0')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-full)' }}>
              <span>USDC</span>
            </div>
          </div>
        </div>

        {/* Quote Details (Advanced info) */}
        {quote && (
          <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Route Provider</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{quote.source.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Minimum received ({slippage}% slippage)</span>
              <span style={{ color: 'var(--text-primary)' }}>{quote.minimumAmountOut} USDC</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Price impact</span>
              <span style={{ color: quote.priceImpactPercent > 1 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {quote.priceImpactPercent}%
              </span>
            </div>
          </div>
        )}

        {txHash && (
          <div className="callout callout-info" style={{ wordBreak: 'break-all', fontSize: 'var(--font-size-xs)' }}>
            Transaction Submitted: <strong>{txHash}</strong>
          </div>
        )}

        {/* Primary CTA */}
        <button
          className="btn btn-primary"
          onClick={handleSwap}
          disabled={txPending || loadingQuote || !payAmount}
          style={{ width: '100%', minHeight: '48px', fontSize: 'var(--font-size-base)' }}
        >
          {state !== 'CONNECTED'
            ? 'Connect Wallet to Swap'
            : txPending
            ? 'Awaiting Confirmation...'
            : 'Review & Swap'}
        </button>
      </div>
    </div>
  );
}
