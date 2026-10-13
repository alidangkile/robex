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

async function renderComponent(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
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

  afterEach(() => {
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

  describe('3. Auto-refresh behavior', () => {
    it('pauses auto-refresh when document is hidden', async () => {
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
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      await typeEthAmount(view.container, '0.0000005');
      const countAfterTyping = fetchCount;
      expect(countAfterTyping).toBeGreaterThanOrEqual(1);

      // Set document.hidden to true
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });

      // Trigger visibilitychange event
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((r) => setTimeout(r, 50));
      });

      // No new fetch while hidden
      expect(fetchCount).toBe(countAfterTyping);

      // Restore document.hidden
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
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
      expect(stepIndicator?.textContent).toContain('Confirmed');

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
      expect(usdgBalanceLine?.querySelector('button')).toBeNull();

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
  });
});
