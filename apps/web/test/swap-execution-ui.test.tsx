/**
 * UI tests for C1 PR 2B Swap Execution, Gates, States, and Pending Guard.
 */
// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatBaseUnits } from '@robex/core';
import { getActiveNetworkConfig, UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import type { SendSwapTransactionParams, SendSwapTransactionResult, SwapStateChangeCallback } from '@robex/types';
import { WalletProvider } from '../src/wallet/wallet-context.js';
import { MockWalletAdapter, FAKE_MOCK_TX_HASH } from '../src/wallet/mock-wallet-adapter.js';
import {
  SwapPage,
  toPlainSwapState,
  type PlainSwapState,
} from '../src/features/swap/SwapPage.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_HASH = '0x1234567890123456789012345678901234567890123456789012345678901234';

function q(container: HTMLElement, testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function liveQuoteFixture(overrides: Record<string, unknown> = {}) {
  const blockSec = Math.floor(Date.now() / 1000);
  const quotedAt = blockSec * 1000;
  const expectedOut = String(overrides.expectedAmountOut ?? '1122');
  const slippageBps = Number(overrides.slippageBps ?? 50);
  const minOut = overrides.minimumAmountOut !== undefined
    ? String(overrides.minimumAmountOut)
    : (BigInt(expectedOut) * (10_000n - BigInt(slippageBps)) / 10_000n).toString();
  return {
    id: 'v4-test-quote',
    source: { id: 'uniswap-v4-eth-usdg', name: 'Uniswap v4', type: 'UNISWAP_V4' },
    chainId: 46630,
    tokenIn: UNISWAP_V4_TESTNET_QUOTE.nativeEth,
    tokenOut: UNISWAP_V4_TESTNET_QUOTE.usdg,
    amountIn: overrides.amountIn !== undefined ? String(overrides.amountIn) : '500000000000',
    expectedAmountOut: expectedOut,
    minimumAmountOut: minOut,
    priceImpactPercent: 0.04,
    priceImpactPercentExact: '0.0400',
    risk: 'normal',
    slippageBps,
    poolFeePips: 3000,
    referenceAmountOut: '1123',
    referenceRate: '2251.616202',
    blockNumber: '130884439',
    blockHash: '0xba68078cd40540f60f2fc104d9006020190cf63abb5d03a713ad396fb170f034',
    blockTimestamp: String(blockSec),
    quotedAt,
    expiresAt: quotedAt + 20_000,
    remainingMs: 20_000,
    tokenInSymbol: 'ETH',
    tokenOutSymbol: 'USDG',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    poolId: UNISWAP_V4_TESTNET_QUOTE.poolId,
    limitations: ['Testnet USDG has no monetary value.'],
    capWei: '100000000000000',
    ...overrides,
  };
}

function mockFetchWithLiveQuote(getOverrides?: (url: string, count: number) => Record<string, unknown>) {
  let count = 0;
  globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    count += 1;
    const urlStr = typeof input === 'string' ? input : input.toString();
    const urlObj = new URL(urlStr, 'http://localhost');
    const amountIn = urlObj.searchParams.get('amountIn') ?? '500000000000';
    const overrides = getOverrides ? getOverrides(urlStr, count) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        quote: liveQuoteFixture({ amountIn, ...overrides }),
      }),
    };
  });
}

async function renderSwapView(adapter = new MockWalletAdapter(), props: { testInitialSwapState?: PlainSwapState } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <WalletProvider initialAdapter={adapter}>
        <SwapPage quoteDelayMs={0} {...props} />
      </WalletProvider>
    );
  });
  return {
    container,
    adapter,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function typeEthAmount(container: HTMLElement, value: string) {
  const input = container.querySelector('[aria-label="You pay ETH"]') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('PR 2B Swap Execution UI Test Suite', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Plain words state representation', () => {
    const allStates: PlainSwapState[] = [
      'ready',
      'waiting for wallet',
      'submitted',
      'pending',
      'confirmed',
      'reverted',
      'anomaly',
      'timeout',
      'rejected',
      'cancelled',
      'expired',
      'wrong network',
      'insufficient balance',
      'error',
    ];

    allStates.forEach((state) => {
      it(`renders status in plain words: "${state}"`, async () => {
        const adapter = new MockWalletAdapter();
        await adapter.connect();
        const view = await renderSwapView(adapter, { testInitialSwapState: state });

        const statusText = q(view.container, 'swap-status-text');
        expect(statusText?.textContent).toBe(state);
        await view.unmount();
      });
    });

    it('toPlainSwapState maps all core states accurately', () => {
      expect(toPlainSwapState('ready')).toBe('ready');
      expect(toPlainSwapState('wallet_confirmation')).toBe('waiting for wallet');
      expect(toPlainSwapState('submitted')).toBe('submitted');
      expect(toPlainSwapState('pending')).toBe('pending');
      expect(toPlainSwapState('confirmed')).toBe('confirmed');
      expect(toPlainSwapState('reverted')).toBe('reverted');
      expect(toPlainSwapState('anomaly')).toBe('anomaly');
      expect(toPlainSwapState('timeout')).toBe('timeout');
      expect(toPlainSwapState('rejected')).toBe('rejected');
      expect(toPlainSwapState('cancelled')).toBe('cancelled');
      expect(toPlainSwapState('expired')).toBe('expired');
      expect(toPlainSwapState('wrong_network')).toBe('wrong network');
      expect(toPlainSwapState('insufficient_balance')).toBe('insufficient balance');
      expect(toPlainSwapState('provider_error')).toBe('error');
      expect(toPlainSwapState('user_error')).toBe('error');
      expect(toPlainSwapState('error')).toBe('error');
    });
  });

  describe('2. Pre-flight Re-quote Gate', () => {
    it('re-quotes immediately before opening wallet and uses fresh quote amountOut', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote((_url, count) => ({
        expectedAmountOut: count === 1 ? '1120' : '1150',
      }));

      let capturedSendParams: SendSwapTransactionParams | null = null;
      adapter.sendSwapTransaction = vi.fn().mockImplementation(async (params: SendSwapTransactionParams) => {
        capturedSendParams = params;
        return { state: 'confirmed', txHash: VALID_HASH, actualAmountReceived: 1150n };
      });

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn).not.toBeNull();
      expect(swapBtn.disabled).toBe(false);

      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      expect(capturedSendParams).not.toBeNull();
      // amountOut must come from the fresh quote (1150n, not initial 1120n)
      expect(capturedSendParams?.amountOut).toBe(1150n);

      await view.unmount();
    });

    it('does NOT open wallet if re-quote is expired', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote((_url, count) => {
        if (count === 1) return {};
        // Fresh re-quote returns an expired block timestamp
        const oldBlock = Math.floor(Date.now() / 1000) - 30;
        return {
          blockTimestamp: String(oldBlock),
          expiresAt: oldBlock * 1000 + 20_000,
          remainingMs: 0,
        };
      });

      const sendSpy = vi.fn();
      adapter.sendSwapTransaction = sendSpy;

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      // Wallet MUST NOT be opened
      expect(sendSpy).not.toHaveBeenCalled();
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('expired');

      await view.unmount();
    });

    it('does NOT open wallet if re-quote price impact exceeds 2%', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote((_url, count) => {
        if (count === 1) return { priceImpactPercent: 0.5 };
        // Fresh re-quote returns price impact 2.5% (> 2%)
        return {
          priceImpactPercent: 2.5,
          priceImpactPercentExact: '2.5000',
        };
      });

      const sendSpy = vi.fn();
      adapter.sendSwapTransaction = sendSpy;

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      // Wallet MUST NOT be opened
      expect(sendSpy).not.toHaveBeenCalled();
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('error');

      await view.unmount();
    });

    it('does NOT open wallet if RANGE_CAP or D2 cap is exceeded', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote((_url, count) => ({
        // Initial quote allows 0.00008, re-quote returns a lower cap 0.00005
        capWei: count === 1 ? '100000000000000' : '50000000000000',
      }));

      const sendSpy = vi.fn();
      adapter.sendSwapTransaction = sendSpy;

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.00008');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      expect(sendSpy).not.toHaveBeenCalled();
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('error');
      expect(view.container.textContent).toContain('exceeds maximum swappable cap');

      await view.unmount();
    });
  });

  describe('3. Confirmed, Timeout, and Anomaly Result Presentation', () => {
    it('on confirmed: shows actual USDG received from result (not quote), explorer link built from config, and refreshes balances', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote(() => ({ expectedAmountOut: '1000' }));

      adapter.sendSwapTransaction = vi.fn().mockImplementation(async () => ({
        state: 'confirmed',
        txHash: VALID_HASH,
        actualAmountReceived: 987654n, // Actual USDG received != quote expectedAmountOut
      }));

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      // Status confirmed
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('confirmed');

      // Actual USDG received from result
      const receivedEl = q(view.container, 'actual-received');
      expect(receivedEl?.textContent).toContain(formatBaseUnits(987654n, 6));

      // Explorer tx link built dynamically from config
      const activeNetwork = getActiveNetworkConfig();
      const expectedExplorerUrl = `${activeNetwork.providers.explorerUrl.replace(/\/+$/, '')}/tx/${VALID_HASH}`;
      const link = q(view.container, 'explorer-tx-link') as HTMLAnchorElement;
      expect(link).not.toBeNull();
      expect(link.href).toBe(expectedExplorerUrl);

      await view.unmount();
    });

    it('on timeout: shows tx hash, explorer link, and explains plainly', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote();

      adapter.sendSwapTransaction = vi.fn().mockImplementation(async (params, onStateChange) => {
        onStateChange?.('submitted', { txHash: VALID_HASH });
        onStateChange?.('timeout', { txHash: VALID_HASH });
        return { state: 'timeout', txHash: VALID_HASH };
      });

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      expect(q(view.container, 'swap-status-text')?.textContent).toBe('timeout');
      expect(q(view.container, 'explorer-tx-link')).not.toBeNull();

      const explanation = q(view.container, 'timeout-explanation');
      expect(explanation).not.toBeNull();
      expect(explanation?.textContent).toContain('180 seconds');

      await view.unmount();
    });

    it('on anomaly: shows tx hash, explorer link, and explains plainly', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote();

      adapter.sendSwapTransaction = vi.fn().mockImplementation(async () => ({
        state: 'anomaly',
        txHash: VALID_HASH,
        anomalyReason: 'Receipt logs format corrupted',
      }));

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      expect(q(view.container, 'swap-status-text')?.textContent).toBe('anomaly');
      expect(q(view.container, 'explorer-tx-link')).not.toBeNull();

      const explanation = q(view.container, 'anomaly-explanation');
      expect(explanation).not.toBeNull();
      expect(explanation?.textContent).toContain('Receipt logs format corrupted');

      await view.unmount();
    });
  });

  describe('4. Dynamic RANGE_CAP display', () => {
    it('displays dynamic Max swappable now never above D2', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote(() => ({ capWei: '30000000000000' })); // 0.00003 ETH

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.00001');

      const maxDisplay = q(view.container, 'max-swappable-display');
      expect(maxDisplay?.textContent).toBe('Max swappable now: 0.00003 ETH');

      await view.unmount();
    });

    it('caps dynamic RANGE_CAP at D2 (0.0001 ETH) if pool cap is higher', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote(() => ({ capWei: '500000000000000' })); // 0.0005 ETH > D2

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.00001');

      const maxDisplay = q(view.container, 'max-swappable-display');
      // Never above D2 (0.0001 ETH)
      expect(maxDisplay?.textContent).toBe('Max swappable now: 0.0001 ETH');

      await view.unmount();
    });
  });

  describe('5. Pending Guard UI and 10-Minute Escape Hatch', () => {
    it('blocks swaps and explains plainly when getPendingSwapStatus detects pending transaction', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      // Put a pending entry in localStorage
      const activeNetwork = getActiveNetworkConfig();
      const storageKey = `robex_pending_swap:${adapter.getAccount()!.address.toLowerCase()}:${activeNetwork.chainId}`;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          txHash: VALID_HASH,
          from: adapter.getAccount()!.address.toLowerCase(),
          chainId: activeNetwork.chainId,
          nonce: 5,
          recordedAt: Date.now() - 60_000, // 1 minute ago
        })
      );

      const view = await renderSwapView(adapter);

      // Pending blocked explanation
      const blockedCallout = q(view.container, 'pending-swap-blocked');
      expect(blockedCallout).not.toBeNull();
      expect(blockedCallout?.textContent).toContain('Swaps are blocked');
      expect(blockedCallout?.textContent).toContain('Only one in-flight transaction is allowed');

      // Swap button disabled
      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(true);

      // Under 10 minutes: no clear button
      expect(q(view.container, 'clear-pending-swap-btn')).toBeNull();

      await view.unmount();
    });

    it('after 10 minutes: offers explicit confirm button that calls clearDroppedPendingSwap', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const activeNetwork = getActiveNetworkConfig();
      const storageKey = `robex_pending_swap:${adapter.getAccount()!.address.toLowerCase()}:${activeNetwork.chainId}`;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          txHash: VALID_HASH,
          from: adapter.getAccount()!.address.toLowerCase(),
          chainId: activeNetwork.chainId,
          nonce: 5,
          recordedAt: Date.now() - 11 * 60 * 1000, // 11 minutes ago (> 10m)
        })
      );

      const clearSpy = vi.fn().mockResolvedValue(true);
      adapter.clearDroppedPendingSwap = clearSpy;

      const view = await renderSwapView(adapter);

      const clearBtn = q(view.container, 'clear-pending-swap-btn') as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();
      expect(clearBtn.textContent).toContain('Confirm and clear dropped transaction');

      await act(async () => {
        clearBtn.click();
      });

      expect(clearSpy).toHaveBeenCalledWith(true);

      await view.unmount();
    });
  });

  describe('6. Mock Label in DEV Mode', () => {
    it('labels swap result with MOCK — not a real transaction when using mock adapter', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote();

      adapter.sendSwapTransaction = vi.fn().mockImplementation(async () => ({
        state: 'confirmed',
        txHash: FAKE_MOCK_TX_HASH,
        actualAmountReceived: 1122n,
      }));

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      const mockLabel = q(view.container, 'mock-tx-label');
      expect(mockLabel).not.toBeNull();
      expect(mockLabel?.textContent).toBe('MOCK — not a real transaction');

      await view.unmount();
    });
  });

  describe('7. Disables button while swap is in progress', () => {
    it('disables swap button while waiting for wallet, submitted, and pending', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      mockFetchWithLiveQuote();

      let stateCallback: SwapStateChangeCallback | undefined;
      let resolveSend!: (res: SendSwapTransactionResult) => void;
      const sendPromise = new Promise<SendSwapTransactionResult>((resolve) => {
        resolveSend = resolve;
      });

      adapter.sendSwapTransaction = vi.fn().mockImplementation((params, onStateChange) => {
        stateCallback = onStateChange;
        return sendPromise;
      });

      const view = await renderSwapView(adapter);
      await typeEthAmount(view.container, '0.0000005');

      const swapBtn = q(view.container, 'swap-execution') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      // Trigger swap execution
      act(() => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      // State: waiting for wallet
      await act(async () => {
        stateCallback?.('wallet_confirmation');
      });
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('waiting for wallet');
      expect((q(view.container, 'swap-execution') as HTMLButtonElement).disabled).toBe(true);

      // State: submitted
      await act(async () => {
        stateCallback?.('submitted', { txHash: VALID_HASH });
      });
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('submitted');
      expect((q(view.container, 'swap-execution') as HTMLButtonElement).disabled).toBe(true);

      // State: pending
      await act(async () => {
        stateCallback?.('pending', { txHash: VALID_HASH });
      });
      expect(q(view.container, 'swap-status-text')?.textContent).toBe('pending');
      expect((q(view.container, 'swap-execution') as HTMLButtonElement).disabled).toBe(true);

      // Finish with confirmed
      await act(async () => {
        resolveSend({ state: 'confirmed', txHash: VALID_HASH, actualAmountReceived: 1122n });
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      expect(q(view.container, 'swap-status-text')?.textContent).toBe('confirmed');

      await view.unmount();
    });
  });
});
