// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwapPage } from '../src/features/swap/SwapPage.js';
import { Header } from '../src/components/Header.js';
import { WalletProvider } from '../src/wallet/wallet-context.js';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { getActiveNetworkConfig } from '@robex/config';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function liveQuoteFixture(overrides: Record<string, unknown> = {}) {
  const blockSec = Math.floor(Date.now() / 1000);
  const quotedAt = blockSec * 1000;
  return {
    id: 'v4-16-500000000000',
    source: { id: 'uniswap-v4-eth-usdg', name: 'Uniswap v4', type: 'UNISWAP_V4' },
    chainId: 46630,
    tokenIn: '0x0000000000000000000000000000000000000000',
    tokenOut: '0x7E955252E15c84f5768B83c41a71F9eba181802F',
    amountIn: '500000000000',
    expectedAmountOut: '1122',
    minimumAmountOut: '1116',
    priceImpactPercent: 0.04,
    priceImpactPercentExact: '0.0400',
    risk: 'normal',
    slippageBps: 50,
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
    poolId: '0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669',
    limitations: ['Testnet USDG has no monetary or redemption value.'],
    ...overrides,
  };
}

const activeViews: Array<() => Promise<void>> = [];

async function renderComponent(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  let unmounted = false;
  const unmount = async () => {
    if (unmounted) return;
    unmounted = true;
    await act(async () => root.unmount());
    container.remove();
  };
  activeViews.push(unmount);
  return {
    container,
    unmount,
  };
}

async function typeEthAmount(container: HTMLElement, value: string) {
  const input = container.querySelector('[aria-label="You pay ETH"]') as HTMLInputElement;
  if (!input) return;
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

describe('Swap UX Polish (Tier B UI-only)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    while (activeViews.length > 0) {
      const u = activeViews.pop();
      if (u) await u();
    }
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. Copy requirements', () => {
    it('removes read-only quote text and not-executable notice, replaces with testnet note', async () => {
      const adapter = new MockWalletAdapter();
      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      const html = view.container.innerHTML;
      expect(html).not.toContain('Read-only ETH to USDG quote');
      expect(html).not.toContain('not an executable swap');
      expect(html).toContain('Real testnet swap');
      expect(html).toContain('Real testnet swap. Testnet tokens have no monetary value.');

      await view.unmount();
    });

    it('shows "Real testnet swap" only once, and card subtitle is "ETH to USDG" (UX-07)', async () => {
      const adapter = new MockWalletAdapter();
      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      const html = view.container.innerHTML;
      expect(view.container.querySelector('.card-subtitle')?.textContent).toBe('ETH to USDG');
      const occurrences = (html.match(/Real testnet swap/g) || []).length;
      expect(occurrences).toBe(1);

      await view.unmount();
    });
  });

  describe('2. Quote details and collapsed Advanced details section', () => {
    it('keeps key quote metrics visible and moves technical metrics into collapsed details', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ quote: liveQuoteFixture() }),
        };
      });

      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');

      const detailsEl = view.container.querySelector('details[data-testid="advanced-details"]') as HTMLDetailsElement;
      expect(detailsEl).toBeTruthy();
      expect(detailsEl.open).toBe(false);

      // Visible outside details
      expect(view.container.textContent).toContain('Uniswap v4');
      expect(view.container.textContent).toContain('Fee');
      expect(view.container.textContent).toContain('Price impact');
      expect(view.container.textContent).toContain('Slippage');
      expect(view.container.textContent).toContain('Minimum received');

      // Advanced items inside <details>
      expect(detailsEl.textContent).toContain('Advanced details');
      expect(detailsEl.querySelector('[data-block-hash]')).toBeTruthy();
      expect(detailsEl.textContent).toContain('Spot reference');
      expect(detailsEl.textContent).toContain('Expires');

      await view.unmount();
    });
  });

  describe('3. Auto-refresh behavior & Stale-While-Revalidate (UX-01, Owner rule)', () => {
    async function connectMockAdapter(adapter: MockWalletAdapter) {
      const p = adapter.connect();
      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      await p;
    }

    it('keeps quote visible during an auto-refresh (stale-while-revalidate UX-01)', async () => {
      vi.useFakeTimers();
      let finishSecondFetch: (() => void) | undefined;
      const secondFetchPromise = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
        finishSecondFetch = () => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ quote: liveQuoteFixture({ expectedAmountOut: '1250', minimumAmountOut: '1243' }) }),
          });
        };
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ quote: liveQuoteFixture({ expectedAmountOut: '1122' }) }),
          };
        }
        return secondFetchPromise;
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(callCount).toBe(1);
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('0.0011');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeTruthy();
      const swapBtn = view.container.querySelector('[data-testid="swap-execution"]') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      // Advance timers to trigger auto-refresh (14000ms, 6s before 20s expiry)
      await act(async () => {
        vi.advanceTimersByTime(14000);
      });

      expect(callCount).toBe(2);

      // During revalidation (second fetch in flight):
      // quote-details stays visible, receive amount is preserved, Swap stays enabled, Updating hint badge shown
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('0.0011');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeTruthy();
      expect(view.container.querySelector('[data-testid="quote-updating-hint"]')).toBeTruthy();
      expect(swapBtn.disabled).toBe(false);

      // Complete second fetch
      finishSecondFetch!();
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // After acceptance: new quote rendered, hint gone, Swap button enabled
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('0.0012');
      expect(view.container.querySelector('[data-testid="quote-updating-hint"]')).toBeNull();
      expect(swapBtn.disabled).toBe(false);

      await view.unmount();
    });

    it('UX-01-R: keeps expired quote and quote-details mounted throughout when auto-refresh takes longer than lead time', async () => {
      vi.useFakeTimers();
      let finishSecondFetch: (() => void) | undefined;
      const secondFetchPromise = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
        finishSecondFetch = () => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ quote: liveQuoteFixture({ expectedAmountOut: '1250', minimumAmountOut: '1243' }) }),
          });
        };
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ quote: liveQuoteFixture({ expectedAmountOut: '1122' }) }),
          };
        }
        return secondFetchPromise;
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(callCount).toBe(1);
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('0.0011');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeTruthy();
      const swapBtn = view.container.querySelector('[data-testid="swap-execution"]') as HTMLButtonElement;
      expect(swapBtn.disabled).toBe(false);

      // Advance 14000ms: auto-refresh fires 6s before 20s expiry
      await act(async () => {
        vi.advanceTimersByTime(14000);
      });
      expect(callCount).toBe(2);

      // Advance another 7000ms (total 21000ms): the 20s quote has expired, but second fetch is still in flight
      await act(async () => {
        vi.advanceTimersByTime(7000);
      });

      // Assert quote-details stays mounted throughout, receive still shows previous quote dimmed, Updating hint visible
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeTruthy();
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('0.0011');
      expect(view.container.querySelector('[data-testid="quote-updating-hint"]')).toBeTruthy();
      // No quote-expired warning callout popping in to shift layout
      expect(view.container.querySelector('[data-testid="quote-expired"]')).toBeNull();
      // Swap button disabled because old quote expired, but still mounted
      expect(swapBtn.disabled).toBe(true);

      // Now complete the second fetch
      finishSecondFetch!();
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // New quote accepted: quote-details still mounted, new quote rendered, hint gone, Swap enabled
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeTruthy();
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('0.0012');
      expect(view.container.querySelector('[data-testid="quote-updating-hint"]')).toBeNull();
      expect(swapBtn.disabled).toBe(false);

      await view.unmount();
    });

    it('pauses auto-refresh when document is hidden and refreshes on return', async () => {
      vi.useFakeTimers();
      let fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ quote: liveQuoteFixture() }),
        };
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(fetchCount).toBe(1);

      // Hide document
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Advance by 18s (past auto-refresh schedule at 17.5s)
      await act(async () => {
        vi.advanceTimersByTime(18000);
      });

      // No new fetch while hidden
      expect(fetchCount).toBe(1);
      expect(view.container.querySelector('[data-testid="quote-paused-hint"]')).toBeTruthy();

      // Advance past 20s quote deadline (+3000ms)
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // Shows "Price paused — click to refresh" once expired
      expect(view.container.textContent).toContain('Price paused — click to refresh');

      // User returns (visible again)
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // Immediate refresh on return!
      expect(fetchCount).toBe(2);

      await view.unmount();
    });

    it('pauses auto-refresh when window is blurred and refreshes on focus return', async () => {
      vi.useFakeTimers();
      let fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ quote: liveQuoteFixture() }),
        };
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(fetchCount).toBe(1);

      // Blur window
      await act(async () => {
        window.dispatchEvent(new Event('blur'));
      });

      // Advance by 18s
      await act(async () => {
        vi.advanceTimersByTime(18000);
      });

      // No auto-refresh while blurred
      expect(fetchCount).toBe(1);
      expect(view.container.querySelector('[data-testid="quote-paused-hint"]')).toBeTruthy();

      // Return focus
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // Immediate refresh on focus return!
      expect(fetchCount).toBe(2);

      await view.unmount();
    });

    it('UX-14: on return (focus or visibility), does not fetch if quote has >= 6s left, resumes schedule', async () => {
      vi.useFakeTimers();
      let fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ quote: liveQuoteFixture() }),
        };
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(fetchCount).toBe(1);

      // Blur window after 2s (18s remaining on 20s quote)
      await act(async () => {
        vi.advanceTimersByTime(2000);
        window.dispatchEvent(new Event('blur'));
      });

      // Stay blurred for 2s (16s remaining > 6s)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchCount).toBe(1);

      // Return focus: >6s left, so NO immediate fetch!
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // Still 1 fetch! (No throttle flap)
      expect(fetchCount).toBe(1);

      // Advance 10s (total 14s elapsed, when remaining becomes 6s): scheduled auto-refresh triggers
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(fetchCount).toBe(2);

      await view.unmount();
    });

    it('pauses auto-refresh when idle for > 2 minutes and refreshes on user activity return', async () => {
      vi.useFakeTimers();
      let fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ quote: liveQuoteFixture() }),
        };
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(fetchCount).toBe(1);

      // Advance past 120s idle timeout and allow the active quote to expire (140s total in steps)
      for (let s = 0; s < 14; s++) {
        await act(async () => {
          vi.advanceTimersByTime(10_000);
        });
      }

      // Expired and paused
      expect(view.container.textContent).toContain('Price paused — click to refresh');

      const countBefore = fetchCount;

      // User performs activity
      await act(async () => {
        window.dispatchEvent(new Event('mousemove'));
      });
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // Immediate refresh on activity return!
      expect(fetchCount).toBe(countBefore + 1);

      await view.unmount();
    });

    it('clicking "Price paused — click to refresh" triggers a quote fetch', async () => {
      vi.useFakeTimers();
      let fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ quote: liveQuoteFixture() }),
        };
      });

      const adapter = new MockWalletAdapter();
      await connectMockAdapter(adapter);

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      expect(fetchCount).toBe(1);

      // Advance past 120s idle timeout and expire in 10s steps (140s total)
      for (let s = 0; s < 14; s++) {
        await act(async () => {
          vi.advanceTimersByTime(10_000);
        });
      }

      expect(view.container.textContent).toContain('Price paused — click to refresh');

      const callout = view.container.querySelector('[data-testid="quote-expired"]') as HTMLElement;
      expect(callout?.textContent).toContain('Price paused — click to refresh');

      const countBefore = fetchCount;
      await act(async () => {
        callout.click();
      });
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(fetchCount).toBeGreaterThan(countBefore);

      await view.unmount();
    });
  });

  describe('4. Status, step indicator, and 60s countdown', () => {
    it('hides status when idle (ready)', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} testInitialSwapState="ready" />
        </WalletProvider>
      );

      expect(view.container.querySelector('[data-testid="swap-status-text"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="swap-step-indicator"]')).toBeNull();

      await view.unmount();
    });

    it('shows step indicator and 60s countdown in waiting-for-wallet state', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} testInitialSwapState="waiting for wallet" />
        </WalletProvider>
      );

      const stepIndicator = view.container.querySelector('[data-testid="swap-step-indicator"]');
      expect(stepIndicator).toBeTruthy();
      expect(stepIndicator?.textContent).toContain('Waiting for wallet');
      expect(stepIndicator?.textContent).toContain('Submitted');
      expect(stepIndicator?.textContent).toContain('Done / Failed');

      const countdown = view.container.querySelector('[data-testid="wallet-countdown"]');
      expect(countdown).toBeTruthy();
      expect(countdown?.textContent).toContain('Sign within 60s or the swap will fail on-chain.');

      await view.unmount();
    });

    it('shows submitted step active without wallet countdown', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} testInitialSwapState="submitted" />
        </WalletProvider>
      );

      const stepIndicator = view.container.querySelector('[data-testid="swap-step-indicator"]');
      expect(stepIndicator).toBeTruthy();
      expect(view.container.querySelector('[data-testid="wallet-countdown"]')).toBeNull();

      await view.unmount();
    });

    it('shows failed step indicator when state is error or reverted', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} testInitialSwapState="error" />
        </WalletProvider>
      );

      const stepIndicator = view.container.querySelector('[data-testid="swap-step-indicator"]');
      expect(stepIndicator).toBeTruthy();
      expect(stepIndicator?.textContent).toContain('Failed');

      await view.unmount();
    });
  });

  describe('5. Balances inside input cards', () => {
    it('shows USDG balance in "You receive" box and keeps percentage buttons on ETH pay box only', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      // USDG balance in You receive box
      const usdgBalanceLine = view.container.querySelector('[data-testid="usdg-balance-line"]');
      expect(usdgBalanceLine).toBeTruthy();
      expect(usdgBalanceLine?.textContent).toContain('USDG');
      expect(Array.from(usdgBalanceLine?.querySelectorAll('button') ?? []).map((b) => b.getAttribute('data-testid'))).toEqual(['add-usdg-button']);

      // Percentage buttons only inside ETH pay box balance section
      const ethBalanceFill = view.container.querySelector('[data-testid="balance-fill"]');
      expect(ethBalanceFill).toBeTruthy();
      const fillButtons = ethBalanceFill?.querySelectorAll('.balance-fill-button');
      expect(fillButtons?.length).toBe(4); // 25, 50, 75, Max

      await view.unmount();
    });
  });

  describe('6 & 7. Header network chip, wallet menu, and sticky header', () => {
    it('renders network chip with active network name and address button menu', async () => {
      const activeNetwork = getActiveNetworkConfig();
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <Header activeTab="swap" onSelectTab={() => {}} />
        </WalletProvider>
      );

      // Network chip
      const chip = view.container.querySelector('.network-chip');
      expect(chip).toBeTruthy();
      expect(chip?.textContent).toContain(activeNetwork.chainName);

      // Address button
      const addrBtn = view.container.querySelector('[data-testid="wallet-address-button"]');
      expect(addrBtn).toBeTruthy();

      // Menu closed initially
      let menu = view.container.querySelector('[data-testid="wallet-menu-dropdown"]');
      expect(menu).toBeTruthy();
      expect((menu as HTMLElement).style.display).toBe('none');

      // Click address button to open menu
      await act(async () => {
        (addrBtn as HTMLButtonElement).click();
      });

      menu = view.container.querySelector('[data-testid="wallet-menu-dropdown"]');
      expect(menu).toBeTruthy();
      expect((menu as HTMLElement).style.display).toBe('flex');
      expect(menu?.textContent).toContain('DEV MOCK');
      expect(menu?.querySelector('[data-testid="wallet-menu-copy"]')).toBeTruthy();
      
      const explorerLink = menu?.querySelector('[data-testid="wallet-menu-explorer"]') as HTMLAnchorElement;
      expect(explorerLink).toBeTruthy();
      expect(explorerLink.href).toContain(activeNetwork.providers.explorerUrl);

      const disconnectBtn = menu?.querySelector('[data-testid="wallet-menu-disconnect"]');
      expect(disconnectBtn).toBeTruthy();

      // Disconnect
      await act(async () => {
        (disconnectBtn as HTMLButtonElement).click();
      });

      // After disconnect, address button is gone
      expect(view.container.querySelector('[data-testid="wallet-address-button"]')).toBeNull();

      await view.unmount();
    });

    it('closes the wallet menu on Escape key (UX-11)', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <Header activeTab="swap" onSelectTab={() => {}} />
        </WalletProvider>
      );

      const addrBtn = view.container.querySelector('[data-testid="wallet-address-button"]') as HTMLButtonElement;
      await act(async () => {
        addrBtn.click();
      });

      const menu = view.container.querySelector('[data-testid="wallet-menu-dropdown"]') as HTMLElement;
      expect(menu.style.display).toBe('flex');

      // Press Escape
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(menu.style.display).toBe('none');

      await view.unmount();
    });
  });

  describe('8. Swap in progress disables input and controls (UX-05)', () => {
    it('disables amount input, % buttons, and Refresh quote while a swap is in progress', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} testInitialSwapState="waiting for wallet" />
        </WalletProvider>
      );

      // Amount input is disabled
      const input = view.container.querySelector('[aria-label="You pay ETH"]') as HTMLInputElement;
      expect(input.disabled).toBe(true);

      // % balance buttons are disabled
      const fillButtons = view.container.querySelectorAll<HTMLButtonElement>('.balance-fill-button');
      fillButtons.forEach((btn) => {
        expect(btn.disabled).toBe(true);
      });

      // Refresh quote button is disabled if present
      const refreshBtn = view.container.querySelector('.btn-secondary') as HTMLButtonElement | null;
      if (refreshBtn && refreshBtn.textContent?.includes('Refresh quote')) {
        expect(refreshBtn.disabled).toBe(true);
      }

      await view.unmount();
    });
  });
});

