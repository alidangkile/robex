import React, { useEffect, useRef, useState } from 'react';
import type { Quote } from '@robex/types';
import { UNISWAP_V4_TESTNET_QUOTE, getActiveNetworkConfig } from '@robex/config';
import {
  QUOTE_ESTIMATE_NOTICE,
  QUOTE_TTL_MS,
  QUOTER_VERIFICATION_NOTICE,
  USDG_VALUE_NOTICE,
  RobexAppError,
  acceptDisplayedQuote,
  advanceQuoteClock,
  type QuoteClockSnapshot,
  type QuoteLifecycleStatus,
  formatBaseUnits,
  parseEthAmountInput,
} from '@robex/core';
import { useWallet } from '../../wallet/wallet-context.js';

interface QuoteBlock {
  reason: string;
  message: string;
  priceImpactPercent?: string;
  blockNumber?: string;
}

export type SlippageWarningLevel = 'notice' | 'warning' | 'strong';

export type SlippageValidationResult =
  | { status: 'ok'; percent: number; bps: number; queryParam: string; warning?: string; warningLevel?: SlippageWarningLevel }
  | { status: 'invalid'; message: string };

/** Lowest slippage (in bps) that triggers the strong warning (Plan 003B Amendment 1, D3). */
export const STRONG_SLIPPAGE_WARNING_BPS = 500;

export const ZERO_SLIPPAGE_NOTICE = '0% slippage may cause transactions to fail if the price moves before execution.';
export const HIGH_SLIPPAGE_WARNING = 'High slippage tolerance increases the risk of unfavorable execution.';

export function strongSlippageWarningText(bps: number): string {
  return `Very high slippage: you could receive up to ${(bps / 100).toString()}% less than the estimate.`;
}

/**
 * Risk level for a validated slippage value, by bps only (preset or Custom):
 * 0 = notice, 101-499 = warning, 500-5000 = strong, anything else = none.
 */
export function classifySlippageBps(bps: number): { level: SlippageWarningLevel; message: string } | null {
  if (!Number.isInteger(bps) || bps < 0 || bps > 5000) return null;
  if (bps === 0) return { level: 'notice', message: ZERO_SLIPPAGE_NOTICE };
  if (bps >= STRONG_SLIPPAGE_WARNING_BPS) return { level: 'strong', message: strongSlippageWarningText(bps) };
  if (bps > 100) return { level: 'warning', message: HIGH_SLIPPAGE_WARNING };
  return null;
}

export function parseSlippagePercentInput(input: string): SlippageValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      status: 'invalid',
      message: 'Enter a slippage tolerance between 0% and 50%.',
    };
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(trimmed)) {
    if (/^(?:0|[1-9]\d*)\.\d{3,}$/.test(trimmed)) {
      return {
        status: 'invalid',
        message: 'Slippage cannot have more than 2 decimal places.',
      };
    }
    return {
      status: 'invalid',
      message: 'Slippage must be a valid number between 0% and 50%.',
    };
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bps > 5000) {
    return {
      status: 'invalid',
      message: 'Slippage tolerance cannot exceed 50%.',
    };
  }
  const percent = bps / 100;
  let queryParam: string;
  if (fraction === '') {
    queryParam = whole;
  } else {
    const trimmedFraction = fraction.replace(/0+$/, '');
    queryParam = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  }
  const risk = classifySlippageBps(bps);
  return {
    status: 'ok',
    percent,
    bps,
    queryParam,
    warning: risk?.message,
    warningLevel: risk?.level,
  };
}

function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

export function SwapPage({
  quoteDelayMs = 300,
  readMonotonic,
}: {
  quoteDelayMs?: number;
  readMonotonic?: () => number | undefined;
}) {
  const getMonotonicNow = readMonotonic ?? (() => (
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : undefined
  ));
  const { state, account, connectInjected, switchToActiveNetwork, invalidationVersion } = useWallet();
  const [payAmount, setPayAmount] = useState('');
  const [slippageMode, setSlippageMode] = useState<'preset' | 'custom'>('preset');
  const [presetSlippage, setPresetSlippage] = useState<number>(0.5);
  const [customSlippageInput, setCustomSlippageInput] = useState<string>('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteTerminalReason, setQuoteTerminalReason] = useState<QuoteLifecycleStatus | null>(null);
  const [block, setBlock] = useState<QuoteBlock | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requestSeq = useRef(0);
  const quoteLifecycleRef = useRef<QuoteClockSnapshot | null>(null);

  const activeNetwork = getActiveNetworkConfig();
  const parsedAmount = parseEthAmountInput(payAmount);
  const effectiveSlippage: SlippageValidationResult = slippageMode === 'preset'
    ? {
        status: 'ok',
        percent: presetSlippage,
        bps: Math.round(presetSlippage * 100),
        queryParam: presetSlippage.toString(),
      }
    : parseSlippagePercentInput(customSlippageInput);
  const wrongNetwork = state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK';
  const blockDeadline = quote?.blockTimestamp && /^(?:0|[1-9]\d*)$/.test(quote.blockTimestamp)
    ? Number(quote.blockTimestamp) * 1000 + QUOTE_TTL_MS
    : null;
  const quoteDeadline = quote && blockDeadline !== null ? Math.min(quote.expiresAt, blockDeadline) : null;
  const snapshot = quoteLifecycleRef.current;
  const monoNow = getMonotonicNow();
  const monoInvalid = Boolean(
    snapshot
    && (
      snapshot.acceptedMonotonicMs === undefined
      || !Number.isFinite(snapshot.acceptedMonotonicMs)
      || snapshot.acceptedMonotonicMs < 0
      || snapshot.remainingBudgetMs === undefined
      || !Number.isFinite(snapshot.remainingBudgetMs)
      || snapshot.remainingBudgetMs < 0
      || snapshot.remainingBudgetMs > QUOTE_TTL_MS
      || monoNow === undefined
      || !Number.isFinite(monoNow)
      || monoNow < 0
      || (snapshot.acceptedMonotonicMs !== undefined && monoNow < snapshot.acceptedMonotonicMs)
    ),
  );
  if (monoInvalid && snapshot && snapshot.terminalStatus === null) {
    snapshot.terminalStatus = 'clock_invalid';
  }
  const monoElapsedMs = (
    snapshot
    && snapshot.acceptedMonotonicMs !== undefined
    && Number.isFinite(snapshot.acceptedMonotonicMs)
    && monoNow !== undefined
    && Number.isFinite(monoNow)
    && monoNow >= snapshot.acceptedMonotonicMs
  )
    ? monoNow - snapshot.acceptedMonotonicMs
    : 0;
  const monoExpired = Boolean(
    snapshot
    && !monoInvalid
    && snapshot.remainingBudgetMs !== undefined
    && Number.isFinite(snapshot.remainingBudgetMs)
    && monoElapsedMs >= snapshot.remainingBudgetMs,
  );
  if (monoExpired && snapshot && snapshot.terminalStatus === null) {
    snapshot.terminalStatus = 'expired';
  }
  const isTerminal = quoteTerminalReason !== null
    || (snapshot?.terminalStatus != null && snapshot.terminalStatus !== 'valid')
    || monoInvalid
    || monoExpired;
  const expired = Boolean(
    quote && (
      isTerminal
      || (quoteDeadline !== null && now >= quoteDeadline)
    ),
  );
  const showQuote = Boolean(quote && quoteDeadline !== null && !expired && !wrongNetwork);
  const wallRemainingMs = quoteDeadline !== null ? Math.max(0, quoteDeadline - now) : 0;
  const monoRemainingMs = snapshot && !monoInvalid && snapshot.remainingBudgetMs !== undefined && Number.isFinite(snapshot.remainingBudgetMs)
    ? Math.max(0, snapshot.remainingBudgetMs - monoElapsedMs)
    : wallRemainingMs;
  const effectiveRemainingMs = Math.min(wallRemainingMs, monoRemainingMs);
  const rawCountdown = Math.ceil(effectiveRemainingMs / 1000);
  const countdownSeconds = Number.isFinite(rawCountdown)
    ? Math.max(0, Math.min(20, rawCountdown))
    : 0;

  useEffect(() => {
    if (!quote) return undefined;
    const checkFreshness = () => {
      const currentNow = Date.now();
      const currentMono = getMonotonicNow();
      const currentSnapshot = quoteLifecycleRef.current;
      if (currentSnapshot) {
        const next = advanceQuoteClock(currentSnapshot, currentNow, currentMono);
        currentSnapshot.highestObservedMs = next.highestObservedMs;
        if (next.status !== 'valid' && currentSnapshot.terminalStatus !== next.status) {
          currentSnapshot.terminalStatus = next.status;
          setQuoteTerminalReason(next.status);
        }
      }
      setNow(currentNow);
    };

    const timer = window.setInterval(checkFreshness, 1000);
    const onResume = () => {
      checkFreshness();
    };

    window.addEventListener('focus', onResume);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onResume);
    }

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onResume);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onResume);
      }
    };
  }, [quote]);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setQuote(null);
    setQuoteTerminalReason(null);
    quoteLifecycleRef.current = null;
    setBlock(null);
    setActionError(null);

    if (wrongNetwork) {
      setLoadingQuote(false);
      setQuoteError('Quotes are hidden because this wallet is not on Robinhood Chain Testnet. Switch network before requesting a new read-only quote.');
      return () => {
        cancelled = true;
      };
    }

    if (effectiveSlippage.status !== 'ok') {
      setLoadingQuote(false);
      return () => {
        cancelled = true;
      };
    }
    const slippageQueryParam = effectiveSlippage.queryParam;
    const resolvedSlippageBps = effectiveSlippage.bps;

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
          slippage: slippageQueryParam,
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
          } else if (reason === 'FUTURE_BLOCK') {
            setQuoteError('The pinned chain block timestamp is ahead of the quote clock. No quote is available. Please verify your system clock is synchronized with network time.');
          } else {
            setQuoteError(message);
          }
          setQuote(null);
          setQuoteTerminalReason(null);
          quoteLifecycleRef.current = null;
          return;
        }

        const browserNow = Date.now();
        const monoNowAtAcceptance = getMonotonicNow();

        if (monoNowAtAcceptance === undefined || !Number.isFinite(monoNowAtAcceptance) || monoNowAtAcceptance < 0) {
          setQuote(null);
          setQuoteTerminalReason(null);
          quoteLifecycleRef.current = null;
          setQuoteError('The device clock is not usable. No quote is shown.');
          return;
        }

        try {
          const accepted = acceptDisplayedQuote(body?.quote, {
            chainId: activeNetwork.chainId,
            tokenIn: UNISWAP_V4_TESTNET_QUOTE.nativeEth,
            tokenOut: UNISWAP_V4_TESTNET_QUOTE.usdg,
            amountIn: amountWei,
            slippageBps: resolvedSlippageBps,
            poolId: UNISWAP_V4_TESTNET_QUOTE.poolId,
          }, browserNow, monoNowAtAcceptance);

          const blockMs = Number(accepted.blockTimestamp) * 1000;
          const blockDeadline = blockMs + QUOTE_TTL_MS;
          const quoteDeadline = Math.min(accepted.expiresAt, blockDeadline);
          const remainingBudgetMs = Math.max(0, Math.min(QUOTE_TTL_MS, quoteDeadline - browserNow));
          const initialStatus: QuoteLifecycleStatus = (browserNow >= quoteDeadline || remainingBudgetMs <= 0)
            ? 'expired'
            : 'valid';

          quoteLifecycleRef.current = {
            blockMs,
            deadlineMs: quoteDeadline,
            highestObservedMs: browserNow,
            terminalStatus: initialStatus === 'valid' ? null : initialStatus,
            acceptedMonotonicMs: monoNowAtAcceptance,
            remainingBudgetMs,
          };
          setQuote(accepted);
          setQuoteTerminalReason(initialStatus === 'valid' ? null : initialStatus);
          setNow(browserNow);
        } catch (err) {
          setQuote(null);
          setQuoteTerminalReason(null);
          quoteLifecycleRef.current = null;
          setQuoteError(err instanceof RobexAppError
            ? err.message
            : 'The quote response was not a live Uniswap v4 ETH → USDG quote.');
          return;
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted || requestSeq.current !== requestId) return;
        setQuote(null);
        setQuoteTerminalReason(null);
        quoteLifecycleRef.current = null;
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
    slippageMode,
    presetSlippage,
    customSlippageInput,
    effectiveSlippage.status,
    effectiveSlippage.status === 'ok' ? effectiveSlippage.bps : -1,
    effectiveSlippage.status === 'ok' ? effectiveSlippage.queryParam : '',
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

  const isActualQuote = Boolean(showQuote && quote);
  const quoteSlippageRisk = showQuote && quote && typeof quote.slippageBps === 'number'
    ? classifySlippageBps(quote.slippageBps)
    : null;
  const receiveText = loadingQuote
    ? 'Calculating...'
    : expired
      ? 'Expired'
      : block
        ? 'Blocked'
        : isActualQuote && quote
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginRight: '2px' }}>Slippage:</span>
              {[0.1, 0.5, 1].map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`slippage-preset-${value}`}
                  onClick={() => {
                    setSlippageMode('preset');
                    setPresetSlippage(value);
                  }}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: slippageMode === 'preset' && presetSlippage === value ? 'var(--bg-tertiary)' : 'transparent',
                    color: slippageMode === 'preset' && presetSlippage === value ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  {value}%
                </button>
              ))}
              {slippageMode === 'custom' ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    border: effectiveSlippage.status === 'invalid'
                      ? '1px solid var(--border-danger, #ef4444)'
                      : '1px solid var(--accent-primary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 6px',
                    backgroundColor: 'var(--bg-tertiary)',
                  }}
                >
                  <input
                    aria-label="Custom slippage percentage"
                    data-testid="custom-slippage-input"
                    inputMode="decimal"
                    placeholder="0.5"
                    value={customSlippageInput}
                    onChange={(e) => setCustomSlippageInput(e.target.value)}
                    style={{
                      width: '46px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--font-size-xs)',
                      textAlign: 'right',
                      outline: 'none',
                      padding: 0,
                    }}
                    autoFocus
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent-primary)', marginLeft: '2px' }}>%</span>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="custom-slippage-toggle"
                  onClick={() => {
                    setSlippageMode('custom');
                  }}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  Custom
                </button>
              )}
            </div>
            {slippageMode === 'custom' && effectiveSlippage.status === 'invalid' && (
              <div
                data-testid="slippage-error"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-danger, #ef4444)',
                  textAlign: 'right',
                  maxWidth: '240px',
                }}
              >
                {effectiveSlippage.message}
              </div>
            )}
            {slippageMode === 'custom' && effectiveSlippage.status === 'ok' && effectiveSlippage.warningLevel === 'strong' && (
              <div
                data-testid="slippage-strong-warning"
                role="alert"
                className="slippage-strong-warning"
              >
                <span aria-hidden="true" className="slippage-strong-warning-icon">⚠</span>
                <span>{effectiveSlippage.warning}</span>
              </div>
            )}
            {slippageMode === 'custom' && effectiveSlippage.status === 'ok' && effectiveSlippage.warning && effectiveSlippage.warningLevel !== 'strong' && (
              <div
                data-testid="slippage-warning"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-warning, #f59e0b)',
                  textAlign: 'right',
                  maxWidth: '240px',
                }}
              >
                {effectiveSlippage.warning}
              </div>
            )}
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
              <div
                data-testid="quote-receive"
                className={isActualQuote ? 'quote-amount-display' : 'quote-status-display'}
                style={{
                  fontSize: isActualQuote ? 'clamp(1.25rem, 6vw, 2rem)' : 'clamp(1rem, 3.5vw, 1.125rem)',
                  fontWeight: isActualQuote ? 700 : 600,
                  color: isActualQuote ? 'var(--text-primary)' : 'var(--text-secondary)',
                  overflowWrap: 'anywhere',
                  fontVariantNumeric: isActualQuote ? 'tabular-nums' : 'normal',
                  lineHeight: isActualQuote ? 1.2 : 1.4,
                }}
              >
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
            {quoteTerminalReason === 'clock_invalid' || quoteLifecycleRef.current?.terminalStatus === 'clock_invalid'
              ? 'The device clock changed or is not usable. This quote is expired. Refresh to read the pool again.'
              : 'This quote expired after 20 seconds. Refresh to read the pool again. The old amount is not a current price.'}
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
            {quoteSlippageRisk?.level === 'strong' && (
              <div
                data-testid="quote-slippage-strong-warning"
                role="alert"
                className="slippage-strong-warning slippage-strong-warning--details"
              >
                <span aria-hidden="true" className="slippage-strong-warning-icon">⚠</span>
                <span>{quoteSlippageRisk.message}</span>
              </div>
            )}
            <Detail label="Block" value={quote.blockNumber ?? '--'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span>Block hash</span>
              <span data-block-hash={quote.blockHash} title={quote.blockHash} style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', textAlign: 'right' }}>
                {quote.blockHash ? shortHash(quote.blockHash) : '--'}
              </span>
            </div>
            <Detail label="Expires" value={`${countdownSeconds}s`} />
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
