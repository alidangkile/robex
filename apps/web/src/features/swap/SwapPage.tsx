import React, { useEffect, useRef, useState } from 'react';
import type { Quote } from '@robex/types';
import { UNISWAP_V4_TESTNET_QUOTE, getActiveNetworkConfig } from '@robex/config';
import {
  QUOTE_ESTIMATE_NOTICE,
  QUOTER_VERIFICATION_NOTICE,
  USDG_VALUE_NOTICE,
  RobexAppError,
  formatBaseUnits,
  parseEthAmountInput,
  resolveQuoteFreshness,
} from '@robex/core';
import { useWallet } from '../../wallet/wallet-context.js';

interface QuoteBlock {
  reason: string;
  message: string;
  priceImpactPercent?: string;
  blockNumber?: string;
}

function isLiveQuote(value: unknown): value is Quote & { blockTimestamp: string; blockHash: string; blockNumber: string } {
  if (!value || typeof value !== 'object') return false;
  const quote = value as Quote;
  return quote.source?.type === 'UNISWAP_V4'
    && quote.risk !== undefined
    && typeof quote.expectedAmountOut === 'string'
    && typeof quote.minimumAmountOut === 'string'
    && typeof quote.expiresAt === 'number'
    && typeof quote.blockNumber === 'string'
    && typeof quote.blockHash === 'string'
    && typeof quote.blockTimestamp === 'string'
    && /^(?:0|[1-9]\d*)$/.test(quote.blockTimestamp);
}

function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

export function SwapPage({ quoteDelayMs = 300 }: { quoteDelayMs?: number }) {
  const { state, account, connectInjected, switchToActiveNetwork, invalidationVersion } = useWallet();
  const [payAmount, setPayAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [block, setBlock] = useState<QuoteBlock | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requestSeq = useRef(0);

  const activeNetwork = getActiveNetworkConfig();
  const parsedAmount = parseEthAmountInput(payAmount);
  const wrongNetwork = state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK';
  const expired = Boolean(quote && now >= quote.expiresAt);
  const showQuote = Boolean(quote && !expired && !wrongNetwork);

  useEffect(() => {
    if (!quote) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quote]);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setQuote(null);
    setBlock(null);
    setActionError(null);

    if (wrongNetwork) {
      setLoadingQuote(false);
      setQuoteError('Quotes are hidden because this wallet is not on Robinhood Chain Testnet. Switch network before requesting a new read-only quote.');
      return () => {
        cancelled = true;
      };
    }

    if (parsedAmount.status === 'empty') {
      setLoadingQuote(false);
      setQuoteError(null);
      return () => {
        cancelled = true;
      };
    }

    if (parsedAmount.status === 'invalid') {
      setLoadingQuote(false);
      setQuoteError(parsedAmount.message);
      return () => {
        cancelled = true;
      };
    }

    setLoadingQuote(true);
    setQuoteError(null);
    const amountWei = parsedAmount.wei;
    const controller = new AbortController();

    const run = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const params = new URLSearchParams({
          tokenIn: UNISWAP_V4_TESTNET_QUOTE.nativeEth,
          tokenOut: UNISWAP_V4_TESTNET_QUOTE.usdg,
          amountIn: amountWei,
          slippage: slippage.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''),
          chainId: String(activeNetwork.chainId),
        });
        const res = await fetch(`${apiUrl}/api/v1/quote?${params.toString()}`, { signal: controller.signal });
        const body = await res.json().catch(() => null) as {
          quote?: unknown;
          error?: { message?: string; details?: Record<string, unknown> };
        } | null;
        if (cancelled || requestSeq.current !== requestId) return;

        if (!res.ok) {
          const details = body?.error?.details;
          const reason = typeof details?.reason === 'string' ? details.reason : 'REQUEST_FAILED';
          const message = body?.error?.message || `Quote request failed (HTTP ${res.status})`;
          const policyBlock = reason === 'PRICE_IMPACT'
            || reason === 'NO_LIQUIDITY'
            || reason === 'RANGE_CAP'
            || reason === 'SAFE_CAP_UNKNOWN'
            || reason === 'POOL_FEE_MISMATCH'
            || reason === 'QUOTER_REVERTED'
            || reason === 'INCONSISTENT_STATE';
          if (policyBlock) {
            setBlock({
              reason,
              message,
              priceImpactPercent: typeof details?.priceImpactPercent === 'string' ? details.priceImpactPercent : undefined,
              blockNumber: typeof details?.blockNumber === 'string' ? details.blockNumber : undefined,
            });
            setQuoteError(null);
          } else {
            setQuoteError(message);
          }
          setQuote(null);
          return;
        }

        if (!isLiveQuote(body?.quote)) {
          setQuote(null);
          setQuoteError('The quote response was not a live Uniswap v4 ETH → USDG quote.');
          return;
        }
        const browserNow = Date.now();
        try {
          resolveQuoteFreshness(BigInt(body.quote.blockTimestamp), browserNow, browserNow);
        } catch (err) {
          setQuote(null);
          setQuoteError(err instanceof RobexAppError
            ? err.message
            : 'The quote block is not fresh on this device. No quote is shown.');
          return;
        }
        setQuote(body.quote);
        setNow(browserNow);
      } catch (err) {
        if (cancelled || controller.signal.aborted || requestSeq.current !== requestId) return;
        setQuote(null);
        setQuoteError(`Quote request failed: ${(err as Error).message}`);
      } finally {
        if (!cancelled && requestSeq.current === requestId) setLoadingQuote(false);
      }
    };

    const timer = quoteDelayMs === 0 ? 0 : window.setTimeout(() => { void run(); }, quoteDelayMs);
    if (quoteDelayMs === 0) void run();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== 0) window.clearTimeout(timer);
    };
  }, [
    payAmount,
    slippage,
    activeNetwork.chainId,
    state,
    account?.address,
    invalidationVersion,
    refreshNonce,
    quoteDelayMs,
    wrongNetwork,
    parsedAmount.status,
    parsedAmount.status === 'ok' ? parsedAmount.wei : '',
    parsedAmount.status === 'invalid' ? parsedAmount.message : '',
  ]);

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

  const receiveText = loadingQuote
    ? 'Calculating...'
    : expired
      ? 'Expired'
      : block
        ? 'Blocked'
        : showQuote && quote
          ? formatBaseUnits(BigInt(quote.expectedAmountOut), 6)
          : '--';

  return (
    <div data-testid="swap-root" style={{ maxWidth: '480px', width: '100%', margin: '0 auto', minWidth: 0 }}>
      <div className="card" style={{ minWidth: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="card-title">Swap</h2>
            <p className="card-subtitle">Read-only ETH to USDG quote</p>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[0.1, 0.5, 1].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSlippage(value)}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: slippage === value ? 'var(--bg-tertiary)' : 'transparent',
                  color: slippage === value ? 'var(--accent-primary)' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {value}%
              </button>
            ))}
          </div>
        </div>

        <div className="callout callout-info" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
          {USDG_VALUE_NOTICE} {QUOTE_ESTIMATE_NOTICE}
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '8px', minWidth: 0 }}>
          <div style={{ marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            You pay
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <input
              aria-label="You pay ETH"
              inputMode="decimal"
              autoComplete="off"
              value={payAmount}
              onChange={(event) => setPayAmount(event.target.value)}
              placeholder="0.0"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 'clamp(1.25rem, 6vw, 2rem)',
                fontWeight: 700,
                width: '100%',
                minWidth: 0,
                outline: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>
              ETH
            </div>
          </div>
          <div style={{ marginTop: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Read-only limit 0.0001 ETH. The active range can set a lower cap.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            ↓
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginTop: '8px', marginBottom: '16px', minWidth: 0 }}>
          <div style={{ marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            You receive (estimated)
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
              <div data-testid="quote-receive" style={{ fontSize: 'clamp(1.25rem, 6vw, 2rem)', fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>
                {receiveText}
              </div>
              {showQuote && (
                <span className="badge badge-injected" style={{ fontSize: '10px' }}>
                  Uniswap v4
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>
              USDG
            </div>
          </div>
        </div>

        {quoteError && (
          <div className="callout callout-warning" data-testid="quote-error" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
            {quoteError}
          </div>
        )}

        {block && !wrongNetwork && (
          <div className="callout callout-error" data-testid="quote-block" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
            <strong>Quote blocked.</strong> {block.message}
            {block.priceImpactPercent && (
              <div data-testid="blocked-impact">Price impact {block.priceImpactPercent}%</div>
            )}
            {block.blockNumber && <div>Read at block {block.blockNumber}</div>}
          </div>
        )}

        {expired && quote && (
          <div className="callout callout-warning" data-testid="quote-expired" style={{ fontSize: 'var(--font-size-xs)' }}>
            This quote expired after 20 seconds. Refresh to read the pool again. The old amount is not a current price.
          </div>
        )}

        {showQuote && quote?.risk === 'warning' && (
          <div className="callout callout-warning" data-testid="quote-warning" style={{ fontSize: 'var(--font-size-xs)' }}>
            Price impact is {quote.priceImpactPercentExact ?? quote.priceImpactPercent}%. Review it before relying on this estimate.
          </div>
        )}

        {actionError && (
          <div className="callout callout-error" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
            <strong>Action Notice:</strong> {actionError}
          </div>
        )}

        {showQuote && quote && (
          <div data-testid="quote-details" style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            <Detail label="Source" value="Uniswap v4" />
            <Detail label="Pool fee" value="0.30%" />
            <Detail label="Spot reference" value={`${quote.referenceRate ?? '--'} USDG / ETH`} />
            <Detail label="Fee-adjusted reference" value={`${quote.referenceAmountOut ? formatBaseUnits(BigInt(quote.referenceAmountOut), 6) : '--'} USDG`} />
            <Detail
              label="Price impact"
              value={`${quote.priceImpactPercentExact ?? quote.priceImpactPercent}%`}
              tone={quote.risk === 'warning' ? 'var(--color-warning)' : 'var(--color-success)'}
            />
            <Detail label="Slippage" value={`${((quote.slippageBps ?? 0) / 100).toString()}%`} />
            <Detail label="Minimum received" value={`${formatBaseUnits(BigInt(quote.minimumAmountOut), 6)} USDG`} />
            <Detail label="Block" value={quote.blockNumber ?? '--'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span>Block hash</span>
              <span data-block-hash={quote.blockHash} title={quote.blockHash} style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', textAlign: 'right' }}>
                {quote.blockHash ? shortHash(quote.blockHash) : '--'}
              </span>
            </div>
            <Detail label="Expires" value={`${Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))}s`} />
            <div style={{ overflowWrap: 'anywhere' }}>
              The 20-second window starts at the chain block time, not when this response arrives.
            </div>
            <div style={{ overflowWrap: 'anywhere' }}>{QUOTER_VERIFICATION_NOTICE}</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {parsedAmount.status === 'ok' && !wrongNetwork && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRefreshNonce((value) => value + 1)}
              disabled={loadingQuote}
              style={{ width: '100%', minHeight: '40px' }}
            >
              Refresh quote
            </button>
          )}
          {!wrongNetwork && (
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="swap-execution"
              disabled
              style={{ width: '100%', minHeight: '48px', fontSize: 'var(--font-size-base)', opacity: 0.7, cursor: 'not-allowed' }}
            >
              Swap execution is a later milestone
            </button>
          )}
          {state === 'DISCONNECTED' && (
            <button type="button" className="btn btn-primary" onClick={handleConnect} style={{ width: '100%', minHeight: '48px' }}>
              Connect Wallet
            </button>
          )}
          {state === 'CONNECTING' && (
            <button type="button" className="btn btn-secondary" disabled style={{ width: '100%', minHeight: '48px' }}>
              Connecting Wallet...
            </button>
          )}
          {wrongNetwork && (
            <button type="button" className="btn btn-warning" onClick={handleSwitchNetwork} style={{ width: '100%', minHeight: '48px' }}>
              Switch to {activeNetwork.chainName}
            </button>
          )}
        </div>
        <p style={{ marginTop: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
          A quote does not ask for a wallet signature. Swap execution stays disabled.
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
      <span>{label}</span>
      <span style={{ color: tone ?? 'var(--text-primary)', fontWeight: 500, overflowWrap: 'anywhere', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
