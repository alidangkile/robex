import React, { useEffect, useRef, useState } from 'react';
import type { Quote } from '@robex/types';
import { UNISWAP_V4_TESTNET_QUOTE, getActiveNetworkConfig } from '@robex/config';
import {
  QUOTE_TTL_MS,
  QUOTER_VERIFICATION_NOTICE,
  RobexAppError,
  acceptDisplayedQuote,
  advanceQuoteClock,
  type QuoteClockSnapshot,
  type QuoteLifecycleStatus,
  formatBaseUnits,
  parseEthAmountInput,
  BALANCE_FILL_PERCENTS,
  percentOfBalanceWei,
  weiToEthInput,
  type BalanceFillPercent,
  getPendingSwapStatus,
  type PendingSwapEntry,
  formatDisplayEth,
  getDisplayEth,
  getDisplayUsdg,
} from '@robex/core';
import type { SendSwapTransactionResult, SwapTransactionState } from '@robex/types';
import { useWallet } from '../../wallet/wallet-context.js';
import { AddUsdgButton } from './AddUsdgButton.js';

export const D2_CAP_WEI = 100_000_000_000_000n; // 0.0001 ETH
export const USER_IDLE_TIMEOUT_MS = 120_000; // 2 minutes (Owner rule)

export type PlainSwapState =
  | 'ready'
  | 'waiting for wallet'
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'reverted'
  | 'anomaly'
  | 'timeout'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'wrong network'
  | 'insufficient balance'
  | 'error';

export function toPlainSwapState(state: SwapTransactionState | string): PlainSwapState {
  switch (state) {
    case 'ready':
      return 'ready';
    case 'wallet_confirmation':
      return 'waiting for wallet';
    case 'submitted':
      return 'submitted';
    case 'pending':
      return 'pending';
    case 'confirmed':
      return 'confirmed';
    case 'reverted':
      return 'reverted';
    case 'anomaly':
      return 'anomaly';
    case 'timeout':
      return 'timeout';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'wrong_network':
      return 'wrong network';
    case 'insufficient_balance':
      return 'insufficient balance';
    case 'provider_error':
    case 'user_error':
    case 'wrong_account':
    case 'error':
    default:
      return 'error';
  }
}

export function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__robex_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function isWebLocksAvailable(): boolean {
  try {
    return typeof navigator !== 'undefined' && Boolean(navigator.locks && typeof navigator.locks.request === 'function');
  } catch {
    return false;
  }
}

/**
 * Shown for FUTURE_BLOCK whether the API or this browser's own freshness
 * check rejected the quote (HA-14 AC-01, QA F-01, Issue #49).
 */
export const FUTURE_BLOCK_CLOCK_GUIDANCE =
  'Your device clock is more than 3 seconds behind network time. Sync your clock (Windows: Settings → Time & language → Date & time → Sync now) and refresh.';

export const FUTURE_BLOCK_NETWORK_SLOW_GUIDANCE =
  'The network was slow to respond. Refresh to get a new quote.';

function balanceButtonLabel(percent: BalanceFillPercent): string {
  return percent === 100 ? 'Max' : `${percent}%`;
}

function balanceButtonAriaLabel(percent: BalanceFillPercent): string {
  return percent === 100 ? 'Use maximum balance' : `Use ${percent}% of balance`;
}

interface QuoteBlock {
  reason: string;
  message: string;
  priceImpactPercent?: string;
  blockNumber?: string;
  capWei?: string;
}

export type SlippageWarningLevel = 'notice' | 'warning' | 'strong';

export type SlippageValidationResult =
  | { status: 'ok'; percent: number; bps: number; queryParam: string; warning?: string; warningLevel?: SlippageWarningLevel }
  | { status: 'invalid'; message: string };

/** Lowest slippage (in bps) that triggers the strong warning (Plan 003B Amendment 1, D3). */
export const STRONG_SLIPPAGE_WARNING_BPS = 500;

export const ZERO_SLIPPAGE_NOTICE = '0% slippage may cause transactions to fail if the price moves before execution.';
/** QA F-05: the wider the tolerance, the more a front-running (MEV) bot can take. */
export const MEV_RISK_NOTE = 'Front-running (MEV) bots can take part of the difference.';
export const HIGH_SLIPPAGE_WARNING = `High slippage tolerance increases the risk of unfavorable execution. ${MEV_RISK_NOTE}`;

export function strongSlippageWarningText(bps: number): string {
  return `Very high slippage: you could receive up to ${(bps / 100).toString()}% less than the estimate. ${MEV_RISK_NOTE}`;
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

export function formatSensibleEth(wei: bigint): string {
  return formatDisplayEth(wei);
}

export function formatRangeCapMessage(message: string, capWei?: string): string {
  if (!capWei) return message;
  const capDisplay = getDisplayEth(capWei);
  const full18 = `${formatBaseUnits(BigInt(capWei), 18)} ETH`;
  if (message.includes(full18)) {
    return message.replace(full18, capDisplay.formattedWithSymbol);
  }
  return message;
}

export function SwapPage({
  quoteDelayMs = 300,
  readMonotonic,
  testInitialSwapState,
}: {
  quoteDelayMs?: number;
  readMonotonic?: () => number | undefined;
  testInitialSwapState?: PlainSwapState;
}) {
  const getMonotonicNow = readMonotonic ?? (() => (
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : undefined
  ));
  const {
    state,
    account,
    connectInjected,
    switchToActiveNetwork,
    invalidationVersion,
    nativeBalance: balance,
    refreshNativeBalance,
    usdgBalance,
    refreshBalances,
    clearDroppedPendingSwap,
    resolvePendingSwap,
    adapter,
    isMockWallet,
  } = useWallet();
  const [usdgAdded, setUsdgAdded] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [slippageMode, setSlippageMode] = useState<'preset' | 'custom'>('preset');
  const [presetSlippage, setPresetSlippage] = useState<number>(0.5);
  const [customSlippageInput, setCustomSlippageInput] = useState<string>('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteTerminalReason, setQuoteTerminalReason] = useState<QuoteLifecycleStatus | null>(null);
  const [block, setBlock] = useState<QuoteBlock | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [isRevalidatingQuote, setIsRevalidatingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requestSeq = useRef(0);
  const quoteLifecycleRef = useRef<QuoteClockSnapshot | null>(null);
  const lastQuoteParamsRef = useRef<{ amountWei: string; slippageBps: number; chainId: number } | null>(null);

  const [isDocVisible, setIsDocVisible] = useState(() => (
    typeof document !== 'undefined' ? !document.hidden : true
  ));
  const [isWinFocused, setIsWinFocused] = useState(() => (
    typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true
  ));
  const [lastActivityTime, setLastActivityTime] = useState(() => Date.now());

  // Clock tick every 1000ms for countdown and idle tracking
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Track window focus, document visibility, and user activity (pointer, key, touch, scroll)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onActivity = () => {
      setLastActivityTime(Date.now());
    };

    const onFocus = () => {
      setIsWinFocused(true);
      setLastActivityTime(Date.now());
    };

    const onBlur = () => {
      setIsWinFocused(false);
    };

    const onVisibility = () => {
      const visible = !document.hidden;
      setIsDocVisible(visible);
      if (visible) {
        setLastActivityTime(Date.now());
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    const activityEvents = ['pointerdown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const;
    activityEvents.forEach((ev) => {
      window.addEventListener(ev, onActivity, { passive: true });
    });

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, onActivity);
      });
    };
  }, []);

  const isUserIdle = (now - lastActivityTime) > USER_IDLE_TIMEOUT_MS;
  const isPageActive = isDocVisible && isWinFocused && !isUserIdle;

  const [swapStateOverride, setSwapStateOverride] = useState<PlainSwapState | null>(testInitialSwapState ?? null);
  const [isExecutingSwap, setIsExecutingSwap] = useState(false);
  const [swapTxHash, setSwapTxHash] = useState<string | null>(null);
  const [actualAmountReceived, setActualAmountReceived] = useState<bigint | null>(null);
  const [swapAnomalyReason, setSwapAnomalyReason] = useState<string | null>(null);
  const [swapErrorDetails, setSwapErrorDetails] = useState<string | null>(null);
  const [swapResult, setSwapResult] = useState<SendSwapTransactionResult | null>(null);

  const [pendingSwap, setPendingSwap] = useState<PendingSwapEntry | null>(null);
  const [clearPendingError, setClearPendingError] = useState<string | null>(null);
  const [isClearingPending, setIsClearingPending] = useState(false);

  const storageAvailable = isLocalStorageAvailable();
  const locksAvailable = isWebLocksAvailable();

  const activeNetwork = getActiveNetworkConfig();

  const checkPending = React.useCallback(() => {
    if (!account?.address) {
      setPendingSwap(null);
      return;
    }
    const address = account.address;
    const chainId = activeNetwork.chainId;
    // Sync read first so the blocked callout paints immediately; then resolve
    // mined/replaced entries (QA-21) and refresh.
    setPendingSwap(getPendingSwapStatus(address, chainId));
    void (async () => {
      try {
        await resolvePendingSwap();
      } catch {
        // Keep showing the stored entry if resolve fails (fail closed).
      }
      setPendingSwap(getPendingSwapStatus(address, chainId));
    })();
  }, [account?.address, activeNetwork.chainId, resolvePendingSwap]);

  useEffect(() => {
    checkPending();
    const interval = window.setInterval(checkPending, 2000);
    return () => window.clearInterval(interval);
  }, [checkPending]);
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
  const showQuote = Boolean(
    quote
    && quoteDeadline !== null
    && (!expired || isRevalidatingQuote)
    && !wrongNetwork,
  );
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
    // QA F-16: also fire exactly at the deadline (wall clock or monotonic budget,
    // whichever is sooner) so the quote is hidden on time instead of up to ~1 s late.
    let deadlineTimer: number | undefined;
    const deadlineSnapshot = quoteLifecycleRef.current;
    if (deadlineSnapshot && deadlineSnapshot.terminalStatus === null) {
      const wallLeftMs = deadlineSnapshot.deadlineMs - Date.now();
      const monoAtSchedule = getMonotonicNow();
      const monoLeftMs = (
        deadlineSnapshot.acceptedMonotonicMs !== undefined
        && deadlineSnapshot.remainingBudgetMs !== undefined
        && monoAtSchedule !== undefined
        && Number.isFinite(monoAtSchedule)
      )
        ? deadlineSnapshot.remainingBudgetMs - (monoAtSchedule - deadlineSnapshot.acceptedMonotonicMs)
        : wallLeftMs;
      const delayMs = Math.min(wallLeftMs, monoLeftMs);
      if (Number.isFinite(delayMs)) {
        deadlineTimer = window.setTimeout(checkFreshness, Math.max(0, Math.min(QUOTE_TTL_MS, delayMs)) + 1);
      }
    }
    const onResume = () => {
      checkFreshness();
    };

    window.addEventListener('focus', onResume);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onResume);
    }

    return () => {
      window.clearInterval(timer);
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
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

    if (wrongNetwork) {
      setLoadingQuote(false);
      setIsRevalidatingQuote(false);
      setQuote(null);
      setQuoteTerminalReason(null);
      quoteLifecycleRef.current = null;
      lastQuoteParamsRef.current = null;
      setBlock(null);
      setActionError(null);
      setQuoteError('Quotes are hidden because this wallet is not on Robinhood Chain Testnet. Switch network before requesting a new quote.');
      return () => {
        cancelled = true;
      };
    }

    if (effectiveSlippage.status !== 'ok') {
      setLoadingQuote(false);
      setIsRevalidatingQuote(false);
      lastQuoteParamsRef.current = null;
      setQuote(null);
      setQuoteTerminalReason(null);
      quoteLifecycleRef.current = null;
      setBlock(null);
      return () => {
        cancelled = true;
      };
    }
    const slippageQueryParam = effectiveSlippage.queryParam;
    const resolvedSlippageBps = effectiveSlippage.bps;

    if (parsedAmount.status === 'empty') {
      setLoadingQuote(false);
      setIsRevalidatingQuote(false);
      lastQuoteParamsRef.current = null;
      setQuote(null);
      setQuoteTerminalReason(null);
      quoteLifecycleRef.current = null;
      setBlock(null);
      setQuoteError(null);
      return () => {
        cancelled = true;
      };
    }

    if (parsedAmount.status === 'invalid') {
      setLoadingQuote(false);
      setIsRevalidatingQuote(false);
      lastQuoteParamsRef.current = null;
      setQuote(null);
      setQuoteTerminalReason(null);
      quoteLifecycleRef.current = null;
      setBlock(null);
      setQuoteError(parsedAmount.message);
      return () => {
        cancelled = true;
      };
    }

    const amountWei = parsedAmount.wei;
    const isSameParams = Boolean(
      lastQuoteParamsRef.current !== null
      && lastQuoteParamsRef.current.amountWei === amountWei
      && lastQuoteParamsRef.current.slippageBps === resolvedSlippageBps
      && lastQuoteParamsRef.current.chainId === activeNetwork.chainId
    );

    if (isSameParams && quote !== null) {
      setIsRevalidatingQuote(true);
      setLoadingQuote(false);
    } else {
      setIsRevalidatingQuote(false);
      setLoadingQuote(true);
      setQuote(null);
      setQuoteTerminalReason(null);
      quoteLifecycleRef.current = null;
      setBlock(null);
    }

    setActionError(null);
    setQuoteError(null);
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
          setIsRevalidatingQuote(false);
          setLoadingQuote(false);
          setQuote(null);
          setQuoteTerminalReason(null);
          quoteLifecycleRef.current = null;
          lastQuoteParamsRef.current = null;
          if (policyBlock) {
            setBlock({
              reason,
              message,
              priceImpactPercent: typeof details?.priceImpactPercent === 'string' ? details.priceImpactPercent : undefined,
              blockNumber: typeof details?.blockNumber === 'string' ? details.blockNumber : undefined,
              capWei: typeof details?.capWei === 'string' ? details.capWei : undefined,
            });
            setQuoteError(null);
          } else if (reason === 'FUTURE_BLOCK') {
            if (details?.rejectReason === 'skew_from_start_gt_2') {
              setQuoteError(FUTURE_BLOCK_NETWORK_SLOW_GUIDANCE);
            } else {
              setQuoteError(FUTURE_BLOCK_CLOCK_GUIDANCE);
            }
          } else {
            setQuoteError(message);
          }
          return;
        }

        const browserNow = Date.now();
        const monoNowAtAcceptance = getMonotonicNow();

        if (monoNowAtAcceptance === undefined || !Number.isFinite(monoNowAtAcceptance) || monoNowAtAcceptance < 0) {
          setIsRevalidatingQuote(false);
          setLoadingQuote(false);
          setQuote(null);
          setQuoteTerminalReason(null);
          quoteLifecycleRef.current = null;
          lastQuoteParamsRef.current = null;
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
          // QA F-15: never exceed the lifetime the server measured at read completion.
          const remainingBudgetMs = Math.max(0, Math.min(QUOTE_TTL_MS, quoteDeadline - browserNow, accepted.remainingMs));
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
          lastQuoteParamsRef.current = {
            amountWei,
            slippageBps: resolvedSlippageBps,
            chainId: activeNetwork.chainId,
          };
          setQuote(accepted);
          setQuoteTerminalReason(initialStatus === 'valid' ? null : initialStatus);
          setNow(browserNow);
          setIsRevalidatingQuote(false);
          setLoadingQuote(false);
        } catch (err) {
          setIsRevalidatingQuote(false);
          setLoadingQuote(false);
          setQuote(null);
          setQuoteTerminalReason(null);
          quoteLifecycleRef.current = null;
          lastQuoteParamsRef.current = null;
          if (err instanceof RobexAppError && err.details?.reason === 'FUTURE_BLOCK') {
            if (err.details?.rejectReason === 'skew_from_start_gt_2') {
              setQuoteError(FUTURE_BLOCK_NETWORK_SLOW_GUIDANCE);
            } else {
              setQuoteError(FUTURE_BLOCK_CLOCK_GUIDANCE);
            }
          } else {
            setQuoteError(err instanceof RobexAppError
              ? err.message
              : 'The quote response was not a live Uniswap v4 ETH → USDG quote.');
          }
          return;
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted || requestSeq.current !== requestId) return;
        setIsRevalidatingQuote(false);
        setLoadingQuote(false);
        setQuote(null);
        setQuoteTerminalReason(null);
        quoteLifecycleRef.current = null;
        lastQuoteParamsRef.current = null;
        setQuoteError(`Quote request failed: ${(err as Error).message}`);
      } finally {
        if (!cancelled && requestSeq.current === requestId) {
          setLoadingQuote(false);
          setIsRevalidatingQuote(false);
        }
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

  const handlePayAmountChange = (value: string) => {
    lastQuoteParamsRef.current = null;
    setPayAmount(value);
    setSwapStateOverride(null);
    setSwapResult(null);
    setSwapErrorDetails(null);
  };

  const handleBalanceFill = (percent: BalanceFillPercent) => {
    if (balance.status !== 'ok') return;
    const wei = percentOfBalanceWei(balance.wei, percent);
    if (wei <= 0n) return;
    lastQuoteParamsRef.current = null;
    setPayAmount(weiToEthInput(wei));
    setSwapStateOverride(null);
    setSwapResult(null);
    setSwapErrorDetails(null);
  };

  const isInsufficientBalance = Boolean(
    state === 'CONNECTED'
    && balance.status === 'ok'
    && parsedAmount.status === 'ok'
    && BigInt(parsedAmount.wei) > balance.wei
  );

  const currentSwapState: PlainSwapState = (() => {
    if (swapStateOverride !== null) return swapStateOverride;
    if (wrongNetwork) return 'wrong network';
    if (isInsufficientBalance) return 'insufficient balance';
    if (expired) return 'expired';
    return 'ready';
  })();

  const isSwapInProgress = isExecutingSwap || ['waiting for wallet', 'submitted', 'pending'].includes(currentSwapState);

  const [walletSignCountdown, setWalletSignCountdown] = useState(60);

  useEffect(() => {
    if (currentSwapState !== 'waiting for wallet') {
      return undefined;
    }
    setWalletSignCountdown(60);
    const interval = window.setInterval(() => {
      setWalletSignCountdown((sec) => Math.max(0, sec - 1));
    }, 1000);
    return () => {
      window.clearInterval(interval);
      setWalletSignCountdown(60);
    };
  }, [currentSwapState]);

  // Owner rule: auto-refresh only while the page is ACTIVE:
  // Active = document visible AND window focused AND user activity (pointer, key, touch, scroll) within the last 2 minutes.
  // Never auto-refresh during a swap.
  useEffect(() => {
    if (!quote) return undefined;
    if (parsedAmount.status !== 'ok') return undefined;
    if (wrongNetwork) return undefined;
    if (isSwapInProgress) return undefined;
    if (!isPageActive) return undefined;

    const currentSnapshot = quoteLifecycleRef.current;
    if (!currentSnapshot || currentSnapshot.terminalStatus !== null) return undefined;

    const currentNow = Date.now();
    const wallLeftMs = currentSnapshot.deadlineMs - currentNow;
    const monoAtSchedule = getMonotonicNow();
    const monoLeftMs = (
      currentSnapshot.acceptedMonotonicMs !== undefined
      && currentSnapshot.remainingBudgetMs !== undefined
      && monoAtSchedule !== undefined
      && Number.isFinite(monoAtSchedule)
    )
      ? currentSnapshot.remainingBudgetMs - (monoAtSchedule - currentSnapshot.acceptedMonotonicMs)
      : wallLeftMs;
    const remainingMs = Math.min(wallLeftMs, monoLeftMs);

    const refreshDelay = Math.max(0, remainingMs - 6000);
    if (refreshDelay <= 0) return undefined;

    const timer = window.setTimeout(() => {
      if (!isPageActive) return;
      if (isSwapInProgress) return;
      if (parsedAmount.status !== 'ok') return;
      if (wrongNetwork) return;

      setRefreshNonce((prev) => prev + 1);
    }, refreshDelay);

    return () => window.clearTimeout(timer);
  }, [quote, parsedAmount.status, wrongNetwork, isSwapInProgress, isPageActive]);

  // Owner rule: when the user returns (focus, visibility or activity), fetch only if less than 6s left or expired; otherwise resume schedule.
  const wasActiveRef = useRef(isPageActive);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isPageActive;

    if (!wasActive && isPageActive) {
      if (isSwapInProgress) return;
      if (parsedAmount.status !== 'ok') return;
      if (wrongNetwork) return;

      const needsImmediateFetch = !quote || expired || effectiveRemainingMs < 6000;
      if (needsImmediateFetch) {
        setRefreshNonce((prev) => prev + 1);
        refreshNativeBalance();
      }
    }
  }, [isPageActive, isSwapInProgress, parsedAmount.status, wrongNetwork, refreshNativeBalance, quote, expired, effectiveRemainingMs]);

  const poolCapWei = (() => {
    const raw = quote?.capWei ?? block?.capWei;
    if (!raw || !/^(?:0|[1-9]\d*)$/.test(raw)) return D2_CAP_WEI;
    try {
      return BigInt(raw);
    } catch {
      return D2_CAP_WEI;
    }
  })();
  const dynamicCapWei = poolCapWei < D2_CAP_WEI ? poolCapWei : D2_CAP_WEI;
  const maxSwappableDisplay = getDisplayEth(dynamicCapWei);
  const maxSwappableEth = maxSwappableDisplay.formatted;

  const handleClearPending = async () => {
    if (!pendingSwap) return;
    setIsClearingPending(true);
    setClearPendingError(null);
    try {
      await clearDroppedPendingSwap(true);
      checkPending();
    } catch (err) {
      setClearPendingError(err instanceof Error ? err.message : 'Failed to clear dropped transaction');
    } finally {
      setIsClearingPending(false);
    }
  };

  const handleExecuteSwap = async () => {
    if (isExecutingSwap) return;
    if (state !== 'CONNECTED' || !account) return;
    if (wrongNetwork) return;
    if (parsedAmount.status !== 'ok') return;
    if (effectiveSlippage.status !== 'ok') return;
    if (pendingSwap !== null) return;

    setIsExecutingSwap(true);
    setSwapErrorDetails(null);
    setSwapAnomalyReason(null);
    setActualAmountReceived(null);
    setSwapTxHash(null);
    setSwapResult(null);

    // 1. Immediately before opening wallet: re-quote!
    let freshQuote: Quote;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const params = new URLSearchParams({
        tokenIn: UNISWAP_V4_TESTNET_QUOTE.nativeEth,
        tokenOut: UNISWAP_V4_TESTNET_QUOTE.usdg,
        amountIn: parsedAmount.wei,
        slippage: effectiveSlippage.queryParam,
        chainId: String(activeNetwork.chainId),
      });

      const res = await fetch(`${apiUrl}/api/v1/quote?${params.toString()}`);
      const body = await res.json().catch(() => null) as {
        quote?: unknown;
        error?: { message?: string; details?: Record<string, unknown> };
      } | null;

      if (!res.ok) {
        const message = body?.error?.message || `Re-quote failed (HTTP ${res.status})`;
        setSwapStateOverride('error');
        setSwapErrorDetails(message);
        setIsExecutingSwap(false);
        return;
      }

      const browserNow = Date.now();
      const monoNow = getMonotonicNow();
      if (monoNow === undefined || !Number.isFinite(monoNow) || monoNow < 0) {
        setSwapStateOverride('error');
        setSwapErrorDetails('Device clock is not usable. Swap aborted.');
        setIsExecutingSwap(false);
        return;
      }

      const accepted = acceptDisplayedQuote(body?.quote, {
        chainId: activeNetwork.chainId,
        tokenIn: UNISWAP_V4_TESTNET_QUOTE.nativeEth,
        tokenOut: UNISWAP_V4_TESTNET_QUOTE.usdg,
        amountIn: parsedAmount.wei,
        slippageBps: effectiveSlippage.bps,
        poolId: UNISWAP_V4_TESTNET_QUOTE.poolId,
      }, browserNow, monoNow);

      const blockMs = Number(accepted.blockTimestamp) * 1000;
      const blockDeadline = blockMs + QUOTE_TTL_MS;
      const quoteDeadline = Math.min(accepted.expiresAt, blockDeadline);

      // Check 1: Expiry
      if (browserNow >= quoteDeadline || accepted.remainingMs <= 0) {
        setSwapStateOverride('expired');
        setSwapErrorDetails('Fresh quote expired before submission.');
        setIsExecutingSwap(false);
        return;
      }

      // Check 2: Price impact > 2%
      const impactVal = Number(accepted.priceImpactPercentExact ?? accepted.priceImpactPercent);
      if (!Number.isFinite(impactVal) || impactVal > 2.0) {
        setSwapStateOverride('error');
        setSwapErrorDetails(`Price impact (${accepted.priceImpactPercent}%) exceeds 2% threshold. Wallet not opened.`);
        setIsExecutingSwap(false);
        return;
      }

      // Check 3: RANGE_CAP / D2 cap
      const capWei = accepted.capWei ? BigInt(accepted.capWei) : D2_CAP_WEI;
      const effectiveCap = capWei < D2_CAP_WEI ? capWei : D2_CAP_WEI;
      if (BigInt(parsedAmount.wei) > effectiveCap) {
        setSwapStateOverride('error');
        setSwapErrorDetails(`Amount exceeds maximum swappable cap (${formatDisplayEth(effectiveCap, { includeSymbol: true })}). Wallet not opened.`);
        setIsExecutingSwap(false);
        return;
      }

      // Check 4: Balance
      if (balance.status === 'ok' && BigInt(parsedAmount.wei) > balance.wei) {
        setSwapStateOverride('insufficient balance');
        setSwapErrorDetails('Insufficient ETH balance.');
        setIsExecutingSwap(false);
        return;
      }

      freshQuote = accepted;
    } catch (err) {
      if (err instanceof RobexAppError && (err.details?.reason === 'STALE_BLOCK' || err.details?.reason === 'QUOTE_EXPIRY')) {
        setSwapStateOverride('expired');
        setSwapErrorDetails('Fresh quote expired before submission.');
        setIsExecutingSwap(false);
        return;
      }
      setSwapStateOverride('error');
      setSwapErrorDetails(err instanceof Error ? err.message : 'Failed to re-quote prior to execution');
      setIsExecutingSwap(false);
      return;
    }

    // 2. Open wallet and send transaction
    try {
      const result = await adapter.sendSwapTransaction(
        {
          chainId: activeNetwork.chainId,
          amountIn: BigInt(parsedAmount.wei),
          amountOut: BigInt(freshQuote.expectedAmountOut),
          slippage: {
            slippageBps: effectiveSlippage.bps,
          },
        },
        (stateChange, details) => {
          const plain = toPlainSwapState(stateChange);
          setSwapStateOverride(plain);
          if (details && typeof details === 'object' && 'txHash' in details && typeof (details as any).txHash === 'string') {
            setSwapTxHash((details as any).txHash);
          }
        }
      );

      setSwapResult(result);
      const finalPlain = toPlainSwapState(result.state);
      setSwapStateOverride(finalPlain);
      if (result.txHash) {
        setSwapTxHash(result.txHash);
      }
      if (result.anomalyReason) {
        setSwapAnomalyReason(result.anomalyReason);
      }
      if (result.error) {
        setSwapErrorDetails(result.error);
      }

      if (finalPlain === 'confirmed') {
        if (result.actualAmountReceived !== undefined) {
          setActualAmountReceived(result.actualAmountReceived);
        }
        refreshBalances();
      }
    } catch (err) {
      setSwapStateOverride('error');
      setSwapErrorDetails(err instanceof Error ? err.message : 'Swap transaction failed');
    } finally {
      setIsExecutingSwap(false);
      checkPending();
    }
  };

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
  const quoteReceiveDisplay = isActualQuote && quote ? getDisplayUsdg(quote.expectedAmountOut) : null;
  const quoteSlippageRisk = showQuote && quote && typeof quote.slippageBps === 'number'
    ? classifySlippageBps(quote.slippageBps)
    : null;
  const receiveText = loadingQuote
    ? 'Calculating...'
    : expired && !isRevalidatingQuote
      ? (!isPageActive ? 'Price paused — click to refresh' : 'Expired')
      : block
        ? 'Blocked'
        : quoteReceiveDisplay
          ? quoteReceiveDisplay.formatted
          : '--';

  return (
    <div data-testid="swap-root" style={{ maxWidth: '480px', width: '100%', margin: '0 auto', minWidth: 0 }}>
      <div className="card" style={{ minWidth: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="card-title">Swap</h2>
            <p className="card-subtitle">ETH to USDG</p>
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

        {!storageAvailable && (
          <div data-testid="storage-warning" className="callout callout-warning" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '8px' }}>
            <strong>Storage Warning:</strong> Local storage is unavailable. Pending transaction guards cannot persist across browser reloads or tabs.
          </div>
        )}
        {!locksAvailable && (
          <div data-testid="locks-warning" className="callout callout-warning" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '8px' }}>
            <strong>Concurrency Warning:</strong> Web Locks API is unavailable. Cross-tab concurrency protection is degraded.
          </div>
        )}

        <div className="callout callout-info" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
          Real testnet swap. Testnet tokens have no monetary value.
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
              disabled={isSwapInProgress}
              aria-disabled={isSwapInProgress}
              onChange={(event) => handlePayAmountChange(event.target.value)}
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
          <div
            data-testid="max-swappable-display"
            title={maxSwappableDisplay.fullWithSymbol}
            style={{ marginTop: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}
          >
            Max swappable now: {maxSwappableEth} ETH
          </div>
          {balance.status !== 'hidden' && (
            <div data-testid="balance-fill" className="balance-fill">
              <div data-testid="balance-line" className="balance-line">
                {balance.status === 'loading' && 'Balance: loading...'}
                {balance.status === 'ok' && (() => {
                  const ethBal = getDisplayEth(balance.wei);
                  return (
                    <>
                      Balance: <span data-testid="balance-value" title={ethBal.fullWithSymbol}>{ethBal.formatted}</span> ETH
                      {balance.isMock && <span data-testid="balance-mock-label" className="balance-mock-label"> (dev mock wallet fixture)</span>}
                    </>
                  );
                })()}
                {balance.status === 'error' && (
                  <span data-testid="balance-error" className="balance-error">{balance.message}</span>
                )}
              </div>
              <div className="balance-fill-buttons" role="group" aria-label="Fill amount from wallet balance">
                {BALANCE_FILL_PERCENTS.map((percent) => {
                  const amount = balance.status === 'ok' ? percentOfBalanceWei(balance.wei, percent) : 0n;
                  const disabled = balance.status !== 'ok' || amount <= 0n || isSwapInProgress;
                  return (
                    <button
                      key={percent}
                      type="button"
                      className="balance-fill-button"
                      data-testid={`balance-fill-${percent}`}
                      aria-label={balanceButtonAriaLabel(percent)}
                      disabled={disabled}
                      aria-disabled={disabled}
                      onClick={() => handleBalanceFill(percent)}
                    >
                      {balanceButtonLabel(percent)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            ↓
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginTop: '8px', marginBottom: '16px', minWidth: 0 }}>
          <div style={{ marginBottom: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '22px' }}>
            <span>You receive (estimated)</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {showQuote && (
                <span className="badge badge-injected" style={{ fontSize: '10px' }}>
                  Uniswap v4
                </span>
              )}
              {showQuote && !isPageActive && (
                <span className="badge badge-paused" data-testid="quote-paused-hint" style={{ fontSize: '10px' }}>
                  Paused
                </span>
              )}
              {isRevalidatingQuote && (
                <span className="badge badge-updating" data-testid="quote-updating-hint" style={{ fontSize: '10px' }}>
                  Updating…
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', minWidth: 0 }}>
            <div
              data-testid="quote-receive"
              className={isActualQuote ? 'quote-amount-display' : 'quote-status-display'}
              title={quoteReceiveDisplay ? quoteReceiveDisplay.fullWithSymbol : undefined}
              onClick={expired && !isPageActive && !isRevalidatingQuote ? () => { setRefreshNonce((n) => n + 1); refreshNativeBalance(); } : undefined}
              style={{
                fontSize: isActualQuote ? 'clamp(1.25rem, 6vw, 2rem)' : 'clamp(1rem, 3.5vw, 1.125rem)',
                fontWeight: isActualQuote ? 700 : 600,
                color: isActualQuote ? 'var(--text-primary)' : 'var(--text-secondary)',
                overflowWrap: 'anywhere',
                fontVariantNumeric: isActualQuote ? 'tabular-nums' : 'normal',
                lineHeight: 1.2,
                opacity: isRevalidatingQuote ? 0.75 : 1,
                cursor: expired && !isPageActive && !isRevalidatingQuote ? 'pointer' : undefined,
                transition: 'opacity 0.15s ease',
              }}
            >
              {receiveText}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>
              USDG
            </div>
          </div>
          {usdgBalance.status !== 'hidden' && (
            <div data-testid="usdg-balance-line" className="balance-line" style={{ marginTop: '10px' }}>
              {usdgBalance.status === 'loading' && 'Balance: loading...'}
              {usdgBalance.status === 'ok' && (() => {
                const usdgBal = getDisplayUsdg(usdgBalance.wei);
                return (
                  <>
                    Balance: <span data-testid="usdg-balance-value" title={usdgBal.fullWithSymbol}>{usdgBal.formatted}</span> USDG
                    {usdgBalance.isMock && <span className="balance-mock-label"> (dev mock wallet fixture)</span>}
                    <AddUsdgButton hasAdded={usdgAdded} onAdded={() => setUsdgAdded(true)} />
                  </>
                );
              })()}
              {usdgBalance.status === 'error' && (
                <span data-testid="usdg-balance-error" className="balance-error">{usdgBalance.message}</span>
              )}
            </div>
          )}
        </div>

        {quoteError && (
          <div className="callout callout-warning" data-testid="quote-error" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
            {quoteError}
          </div>
        )}

        {block && !wrongNetwork && (
          <div className="callout callout-error" data-testid="quote-block" style={{ fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>
            <strong>Quote blocked.</strong>{' '}
            {block.reason === 'RANGE_CAP' && block.capWei ? (
              <span title={getDisplayEth(block.capWei).fullWithSymbol}>
                {formatRangeCapMessage(block.message, block.capWei)}
              </span>
            ) : block.message}
            {block.priceImpactPercent && (
              <div data-testid="blocked-impact">Price impact {block.priceImpactPercent}%</div>
            )}
            {block.blockNumber && <div>Read at block {block.blockNumber}</div>}
          </div>
        )}

        {expired && quote && !isRevalidatingQuote && (
          <div
            className="callout callout-warning"
            data-testid="quote-expired"
            style={{ fontSize: 'var(--font-size-xs)', cursor: !isPageActive ? 'pointer' : undefined }}
            onClick={!isPageActive ? () => { setRefreshNonce((n) => n + 1); refreshNativeBalance(); } : undefined}
          >
            {!isPageActive
              ? 'Price paused — click to refresh'
              : (quoteTerminalReason === 'clock_invalid' || quoteLifecycleRef.current?.terminalStatus === 'clock_invalid'
                ? 'The device clock changed or is not usable. This quote is expired. Refresh to read the pool again.'
                : 'This quote expired after 20 seconds. Refresh to read the pool again. The old amount is not a current price.')}
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
          <div
            data-testid="quote-details"
            style={{
              padding: '12px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              minWidth: 0,
              opacity: isRevalidatingQuote ? 0.8 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            <Detail label="Source" value="Uniswap v4" />
            <Detail label="Pool fee" value="0.30%" />
            <Detail
              label="Price impact"
              value={`${quote.priceImpactPercentExact ?? quote.priceImpactPercent}%`}
              tone={quote.risk === 'warning' ? 'var(--color-warning)' : 'var(--color-success)'}
            />
            <Detail
              label="Slippage"
              value={`${((quote.slippageBps ?? 0) / 100).toString()}%`}
              tone={quoteSlippageRisk?.level === 'strong'
                ? 'var(--color-error)'
                : quoteSlippageRisk?.level === 'warning'
                  ? 'var(--color-warning)'
                  : undefined}
              testId="quote-slippage"
            />
            {(() => {
              const minReceivedDisplay = quote.minimumAmountOut ? getDisplayUsdg(quote.minimumAmountOut) : null;
              return (
                <Detail
                  label="Minimum received"
                  value={minReceivedDisplay ? `${minReceivedDisplay.formatted} USDG` : '--'}
                  title={minReceivedDisplay ? minReceivedDisplay.fullWithSymbol : undefined}
                  tone={quoteSlippageRisk?.level === 'strong'
                    ? 'var(--color-error)'
                    : quoteSlippageRisk?.level === 'warning'
                      ? 'var(--color-warning)'
                      : undefined}
                  testId="quote-minimum-received"
                />
              );
            })()}
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
            <details data-testid="advanced-details" className="advanced-details" style={{ marginTop: '4px', borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))', paddingTop: '6px' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px', listStyle: 'none' }}>
                <span className="advanced-details-caret" aria-hidden="true">▶</span>
                <span>Advanced details</span>
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <Detail label="Spot reference" value={`${quote.referenceRate ?? '--'} USDG / ETH`} />
                {(() => {
                  const refDisplay = quote.referenceAmountOut ? getDisplayUsdg(quote.referenceAmountOut) : null;
                  return (
                    <Detail
                      label="Fee-adjusted reference"
                      value={refDisplay ? `${refDisplay.formatted} USDG` : '--'}
                      title={refDisplay ? refDisplay.fullWithSymbol : undefined}
                    />
                  );
                })()}
                <Detail label="Block" value={quote.blockNumber ?? '--'} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <span>Block hash</span>
                  <span data-block-hash={quote.blockHash} title={quote.blockHash} style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', textAlign: 'right' }}>
                    {quote.blockHash ? shortHash(quote.blockHash) : '--'}
                  </span>
                </div>
                <Detail label="Expires" value={!isPageActive ? `${countdownSeconds}s (Paused)` : `${countdownSeconds}s`} />
                <div style={{ overflowWrap: 'anywhere' }}>
                  The 20-second window starts at the chain block time, not when this response arrives.
                </div>
                <div style={{ overflowWrap: 'anywhere' }}>{QUOTER_VERIFICATION_NOTICE}</div>
              </div>
            </details>
          </div>
        )}

        {pendingSwap && (
          <div data-testid="pending-swap-blocked" className="callout callout-warning" style={{ fontSize: 'var(--font-size-xs)', marginBottom: '12px' }}>
            <strong>Swaps are blocked:</strong> A transaction ({shortHash(pendingSwap.txHash)}) is already pending on Robinhood Chain Testnet. Only one in-flight transaction is allowed per session to prevent nonce conflicts and duplicate sends.
            {now - pendingSwap.recordedAt >= 10 * 60 * 1000 && (
              <div data-testid="pending-swap-clear-section" style={{ marginTop: '8px' }}>
                <p style={{ marginBottom: '6px' }}>This transaction has been pending for over 10 minutes and may have been dropped from the mempool.</p>
                <button
                  type="button"
                  data-testid="clear-pending-swap-btn"
                  className="btn btn-warning"
                  disabled={isClearingPending}
                  onClick={handleClearPending}
                  style={{ width: '100%', minHeight: '36px', fontSize: 'var(--font-size-xs)' }}
                >
                  {isClearingPending ? 'Clearing...' : 'Confirm and clear dropped transaction'}
                </button>
              </div>
            )}
            {clearPendingError && (
              <div data-testid="clear-pending-error" style={{ color: 'var(--text-danger)', marginTop: '4px' }}>
                {clearPendingError}
              </div>
            )}
          </div>
        )}

        {currentSwapState !== 'ready' && (
          <div data-testid="swap-status-card" style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isExecutingSwap || ['waiting for wallet', 'submitted', 'pending', 'confirmed', 'reverted', 'anomaly', 'timeout', 'rejected', 'cancelled', 'error'].includes(currentSwapState) ? '10px' : '0' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Status:</span>
              <div
                data-testid="swap-status"
                className="badge"
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  textTransform: 'lowercase',
                  backgroundColor: currentSwapState === 'confirmed' ? 'rgba(34, 197, 94, 0.15)' : currentSwapState === 'error' || currentSwapState === 'reverted' || currentSwapState === 'anomaly' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)',
                  color: currentSwapState === 'confirmed' ? 'var(--color-success, #22c55e)' : currentSwapState === 'error' || currentSwapState === 'reverted' || currentSwapState === 'anomaly' ? 'var(--color-error, #ef4444)' : 'var(--text-primary)',
                }}
              >
                <span data-testid="swap-status-text">{currentSwapState}</span>
              </div>
            </div>

            {(isExecutingSwap || ['waiting for wallet', 'submitted', 'pending', 'confirmed', 'reverted', 'anomaly', 'timeout', 'rejected', 'cancelled', 'error'].includes(currentSwapState)) && (
              <div data-testid="swap-step-indicator" className="swap-step-indicator">
                <div
                  data-testid="step-waiting-for-wallet"
                  className={`step-item ${currentSwapState === 'waiting for wallet' ? 'step-item--active' : ['submitted', 'pending', 'confirmed', 'reverted', 'anomaly', 'timeout'].includes(currentSwapState) ? 'step-item--complete' : ''}`}
                >
                  <span className="step-badge">
                    {['submitted', 'pending', 'confirmed', 'reverted', 'anomaly', 'timeout'].includes(currentSwapState) ? '✓' : '1'}
                  </span>
                  <span>Waiting for wallet</span>
                </div>

                <span className="step-arrow">→</span>

                <div
                  data-testid="step-submitted"
                  className={`step-item ${currentSwapState === 'submitted' || currentSwapState === 'pending' ? 'step-item--active' : currentSwapState === 'confirmed' ? 'step-item--complete' : ''}`}
                >
                  <span className="step-badge">
                    {currentSwapState === 'confirmed' ? '✓' : '2'}
                  </span>
                  <span>Submitted</span>
                </div>

                <span className="step-arrow">→</span>

                <div
                  data-testid="step-confirmed-or-failed"
                  className={`step-item ${currentSwapState === 'confirmed' ? 'step-item--complete' : ['reverted', 'anomaly', 'timeout', 'rejected', 'cancelled', 'error'].includes(currentSwapState) ? 'step-item--failed' : ''}`}
                >
                  <span className="step-badge">
                    {currentSwapState === 'confirmed' ? '✓' : ['reverted', 'anomaly', 'timeout', 'rejected', 'cancelled', 'error'].includes(currentSwapState) ? '✕' : '3'}
                  </span>
                  <span>
                    {currentSwapState === 'confirmed' ? 'Confirmed' : ['reverted', 'anomaly', 'timeout', 'rejected', 'cancelled', 'error'].includes(currentSwapState) ? 'Failed' : 'Done / Failed'}
                  </span>
                </div>
              </div>
            )}

            {currentSwapState === 'waiting for wallet' && (
              <div data-testid="wallet-countdown" className="wallet-countdown">
                Sign within {walletSignCountdown}s or the swap will fail on-chain.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {parsedAmount.status === 'ok' && !wrongNetwork && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setRefreshNonce((value) => value + 1);
                refreshNativeBalance();
              }}
              disabled={loadingQuote || isSwapInProgress}
              style={{ width: '100%', minHeight: '40px' }}
            >
              Refresh quote
            </button>
          )}
          {!wrongNetwork && (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="swap-execution"
              disabled={state !== 'CONNECTED' || isExecutingSwap || !showQuote || expired || block !== null || parsedAmount.status !== 'ok' || pendingSwap !== null || isInsufficientBalance}
              onClick={handleExecuteSwap}
              style={{
                width: '100%',
                minHeight: '48px',
                fontSize: 'var(--font-size-base)',
                cursor: (state !== 'CONNECTED' || isExecutingSwap || !showQuote || expired || block !== null || parsedAmount.status !== 'ok' || pendingSwap !== null || isInsufficientBalance) ? 'not-allowed' : 'pointer',
                opacity: (state !== 'CONNECTED' || isExecutingSwap || !showQuote || expired || block !== null || parsedAmount.status !== 'ok' || pendingSwap !== null || isInsufficientBalance) ? 0.6 : 1,
              }}
            >
              {isExecutingSwap ? (
                currentSwapState === 'waiting for wallet' ? 'Waiting for wallet...' :
                currentSwapState === 'submitted' ? 'Submitted...' :
                currentSwapState === 'pending' ? 'Pending confirmation...' :
                'Executing swap...'
              ) : 'Swap'}
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

        {swapResult && (
          <div data-testid="swap-result" className={`callout callout-${currentSwapState === 'confirmed' ? 'success' : currentSwapState === 'reverted' ? 'error' : 'warning'}`} style={{ fontSize: 'var(--font-size-xs)', marginTop: '12px' }}>
            {isMockWallet && (
              <div data-testid="mock-tx-label" style={{ fontWeight: 700, color: 'var(--text-warning)', marginBottom: '4px' }}>
                MOCK — not a real transaction
              </div>
            )}
            <div style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: '4px' }}>
              Transaction {currentSwapState}
            </div>
            {currentSwapState === 'confirmed' && actualAmountReceived !== null && (() => {
              const actualDisplay = getDisplayUsdg(actualAmountReceived);
              return (
                <>
                  <div data-testid="actual-received" style={{ marginBottom: '6px' }}>
                    Received: <strong data-testid="actual-received-amount" title={actualDisplay.fullWithSymbol}>{actualDisplay.formatted} USDG</strong>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <AddUsdgButton hasAdded={usdgAdded} onAdded={() => setUsdgAdded(true)} />
                  </div>
                </>
              );
            })()}
            {swapTxHash && (
              <div style={{ marginBottom: '6px', overflowWrap: 'anywhere' }}>
                <span>Transaction: </span>
                <a
                  data-testid="explorer-tx-link"
                  href={`${activeNetwork.providers.explorerUrl.replace(/\/+$/, '')}/tx/${swapTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
                >
                  {shortHash(swapTxHash)}
                </a>
              </div>
            )}
            {currentSwapState === 'timeout' && (
              <p data-testid="timeout-explanation" style={{ margin: '4px 0 0 0' }}>
                Transaction {shortHash(swapTxHash ?? '')} was submitted to the network, but no receipt was confirmed within 180 seconds. The transaction may still confirm later on-chain.
              </p>
            )}
            {currentSwapState === 'anomaly' && (
              <p data-testid="anomaly-explanation" style={{ margin: '4px 0 0 0' }}>
                Transaction {shortHash(swapTxHash ?? '')} completed with an unexpected outcome or state mismatch: {swapAnomalyReason || 'Receipt verification detected an anomaly'}. Check your wallet activity.
              </p>
            )}
            {currentSwapState === 'reverted' && (
              <p data-testid="reverted-explanation" style={{ margin: '4px 0 0 0' }}>
                The transaction was reverted on-chain. No funds were swapped.
              </p>
            )}
            {currentSwapState === 'rejected' && (
              <p data-testid="rejected-explanation" style={{ margin: '4px 0 0 0' }}>
                Transaction was rejected in your wallet.
              </p>
            )}
            {currentSwapState === 'cancelled' && (
              <p data-testid="cancelled-explanation" style={{ margin: '4px 0 0 0' }}>
                Transaction was cancelled due to wallet disconnect or account change.
              </p>
            )}
            {currentSwapState === 'expired' && (
              <p data-testid="expired-explanation" style={{ margin: '4px 0 0 0' }}>
                Transaction expired before execution.
              </p>
            )}
          </div>
        )}
        {swapErrorDetails && (
          <div data-testid="swap-error-callout" className="callout callout-error" style={{ fontSize: 'var(--font-size-xs)', marginTop: '8px' }}>
            <strong>Swap Notice:</strong> {swapErrorDetails}
          </div>
        )}

        <p style={{ marginTop: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
          Swaps execute on Robinhood Chain Testnet via Uniswap v4 Universal Router. Re-quote verified prior to transaction submission.
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value, tone, testId, title }: { label: string; value: string; tone?: string; testId?: string; title?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
      <span>{label}</span>
      <span data-testid={testId} title={title} style={{ color: tone ?? 'var(--text-primary)', fontWeight: 500, overflowWrap: 'anywhere', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
