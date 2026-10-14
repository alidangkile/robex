// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AddUsdgButton } from '../src/features/swap/AddUsdgButton.js';
import { SwapPage } from '../src/features/swap/SwapPage.js';
import { WalletProvider } from '../src/wallet/wallet-context.js';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import type { WatchAssetResult } from '@robex/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

class TestWalletAdapter extends MockWalletAdapter {
  public watchResult: Promise<WatchAssetResult> | WatchAssetResult = 'added';
  public watchError: Error | null = null;
  public watchCallCount = 0;

  constructor() {
    super();
    // Start connected on testnet (46630)
    (this as any).state = 'CONNECTED';
    (this as any).account = {
      address: '0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B',
      chainId: 46630,
    };
  }

  public async watchUsdgAsset(): Promise<WatchAssetResult> {
    this.watchCallCount += 1;
    if (this.watchError) {
      throw this.watchError;
    }
    return await this.watchResult;
  }
}

describe('AddUsdgButton (Increment 2)', () => {
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
  });

  afterEach(async () => {
    while (activeViews.length > 0) {
      const u = activeViews.pop();
      if (u) await u();
    }
    if (originalClipboard) {
      Object.defineProperty(Navigator.prototype, 'clipboard', originalClipboard);
    }
    vi.restoreAllMocks();
  });

  describe('Visibility rules (AC-4)', () => {
    it('is not rendered when wallet is disconnected', async () => {
      const adapter = new TestWalletAdapter();
      (adapter as any).state = 'DISCONNECTED';
      (adapter as any).account = null;

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      expect(view.container.querySelector('[data-testid="add-usdg-button"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="add-usdg-status"]')).toBeNull();
      await view.unmount();
    });

    it('is not rendered when connected on wrong network (not 46630)', async () => {
      const adapter = new TestWalletAdapter();
      (adapter as any).state = 'WRONG_NETWORK';
      (adapter as any).account = {
        address: '0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B',
        chainId: 1, // Ethereum mainnet
      };

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      expect(view.container.querySelector('[data-testid="add-usdg-button"]')).toBeNull();
      await view.unmount();
    });

    it('is not rendered when adapter lacks watchUsdgAsset', async () => {
      const adapter = new TestWalletAdapter();
      (adapter as any).watchUsdgAsset = undefined;

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      expect(view.container.querySelector('[data-testid="add-usdg-button"]')).toBeNull();
      await view.unmount();
    });

    it('is rendered when connected on 46630 with watchUsdgAsset adapter', async () => {
      const adapter = new TestWalletAdapter();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('+ Add USDG to wallet');
      await view.unmount();
    });
  });

  describe('UI States and Exact Copy (AC-3)', () => {
    it('idle state: shows "+ Add USDG to wallet" and no message', async () => {
      const adapter = new TestWalletAdapter();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]');
      expect(btn?.textContent).toBe('+ Add USDG to wallet');
      expect(btn?.hasAttribute('disabled')).toBe(false);
      expect(view.container.querySelector('[data-testid="add-usdg-status"]')).toBeNull();
      await view.unmount();
    });

    it('pending state: button is disabled with "Check your wallet…", no message', async () => {
      const adapter = new TestWalletAdapter();
      let resolveCall!: (res: WatchAssetResult) => void;
      adapter.watchResult = new Promise<WatchAssetResult>((resolve) => {
        resolveCall = resolve;
      });

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toBe('Check your wallet…');
      expect(view.container.querySelector('[data-testid="add-usdg-status"]')).toBeNull();

      // Clean up unresolved promise
      await act(async () => {
        resolveCall('added');
      });
      await view.unmount();
    });

    it('added state: button is hidden, message is "USDG added to your wallet"', async () => {
      const adapter = new TestWalletAdapter();
      adapter.watchResult = 'added';

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(view.container.querySelector('[data-testid="add-usdg-button"]')).toBeNull();
      const statusEl = view.container.querySelector('[data-testid="add-usdg-status"]');
      expect(statusEl?.textContent?.trim()).toBe('USDG added to your wallet');
      await view.unmount();
    });

    it('declined state: button is back to idle, message is "Not added" (neutral)', async () => {
      const adapter = new TestWalletAdapter();
      adapter.watchResult = 'declined';

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      // Button is visible and back to idle
      const refreshedBtn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      expect(refreshedBtn).not.toBeNull();
      expect(refreshedBtn.textContent).toBe('+ Add USDG to wallet');
      expect(refreshedBtn.disabled).toBe(false);

      const statusEl = view.container.querySelector('[data-testid="add-usdg-status"]');
      expect(statusEl?.textContent?.trim()).toBe('Not added');
      await view.unmount();
    });

    it('unsupported state: button is hidden, message has manual instructions + address + Copy button', async () => {
      const adapter = new TestWalletAdapter();
      adapter.watchResult = 'unsupported';

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(view.container.querySelector('[data-testid="add-usdg-button"]')).toBeNull();

      const statusEl = view.container.querySelector('[data-testid="add-usdg-status"]');
      expect(statusEl?.textContent).toContain(
        "Your wallet can't add tokens automatically. Add it manually with this address:"
      );
      expect(statusEl?.textContent).toContain(UNISWAP_V4_TESTNET_QUOTE.usdg);

      const copyBtn = view.container.querySelector('[data-testid="copy-usdg-address"]');
      expect(copyBtn).not.toBeNull();
      expect(copyBtn?.textContent).toBe('Copy');
      await view.unmount();
    });

    it('wrong-network state: button is hidden, message is "Switch to Robinhood Chain Testnet first"', async () => {
      const adapter = new TestWalletAdapter();
      adapter.watchResult = 'wrong-network';

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(view.container.querySelector('[data-testid="add-usdg-button"]')).toBeNull();
      const statusEl = view.container.querySelector('[data-testid="add-usdg-status"]');
      expect(statusEl?.textContent?.trim()).toBe('Switch to Robinhood Chain Testnet first');
      await view.unmount();
    });

    it('other error state: button back to idle, message is "Couldn\'t add USDG. Try again."', async () => {
      const adapter = new TestWalletAdapter();
      adapter.watchError = new Error('Internal RPC boom!');

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      const refreshedBtn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      expect(refreshedBtn).not.toBeNull();
      expect(refreshedBtn.textContent).toBe('+ Add USDG to wallet');
      expect(refreshedBtn.disabled).toBe(false);

      const statusEl = view.container.querySelector('[data-testid="add-usdg-status"]');
      expect(statusEl?.textContent?.trim()).toBe("Couldn't add USDG. Try again.");
      // No raw error text leaked
      expect(view.container.textContent).not.toContain('Internal RPC boom!');
      await view.unmount();
    });
  });

  describe('Interaction and edge cases', () => {
    it('double click sends exactly one request', async () => {
      const adapter = new TestWalletAdapter();
      let resolveCall!: (res: WatchAssetResult) => void;
      adapter.watchResult = new Promise<WatchAssetResult>((resolve) => {
        resolveCall = resolve;
      });

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
        btn.click();
      });

      expect(adapter.watchCallCount).toBe(1);

      await act(async () => {
        resolveCall('added');
      });
      await view.unmount();
    });

    it('copy button copies exact config address to clipboard', async () => {
      const adapter = new TestWalletAdapter();
      adapter.watchResult = 'unsupported';

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: writeTextMock,
        },
        configurable: true,
      });

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <AddUsdgButton />
        </WalletProvider>
      );

      const btn = view.container.querySelector('[data-testid="add-usdg-button"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      const copyBtn = view.container.querySelector('[data-testid="copy-usdg-address"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();

      await act(async () => {
        copyBtn.click();
      });

      expect(writeTextMock).toHaveBeenCalledWith(UNISWAP_V4_TESTNET_QUOTE.usdg);
      expect(copyBtn.textContent).toBe('Copied!');
      await view.unmount();
    });
  });

  describe('Integration with SwapPage (two places)', () => {
    it('renders in the USDG balance line when connected on testnet and usdgBalance.status is ok', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      // Give mock balance time to resolve
      await act(async () => {
        await new Promise((res) => setTimeout(res, 50));
      });

      const usdgBalanceLine = view.container.querySelector('[data-testid="usdg-balance-line"]');
      expect(usdgBalanceLine).not.toBeNull();

      const addBtnInBalance = usdgBalanceLine?.querySelector('[data-testid="add-usdg-button"]');
      expect(addBtnInBalance).not.toBeNull();
      expect(addBtnInBalance?.textContent).toBe('+ Add USDG to wallet');

      await view.unmount();
    });

    it('renders in confirmed-swap panel under actual-received, and synchronizes added state to balance line', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      adapter.sendSwapTransaction = vi.fn().mockImplementation(async () => ({
        state: 'confirmed',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        actualAmountReceived: 987654n,
      }));

      const blockSec = Math.floor(Date.now() / 1000);
      const quotedAt = blockSec * 1000;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          quote: {
            id: 'v4-test-quote',
            source: { id: 'uniswap-v4-eth-usdg', name: 'Uniswap v4', type: 'UNISWAP_V4' },
            chainId: 46630,
            tokenIn: '0x0000000000000000000000000000000000000000',
            tokenOut: UNISWAP_V4_TESTNET_QUOTE.usdg,
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
            poolId: UNISWAP_V4_TESTNET_QUOTE.poolId,
            limitations: ['Testnet USDG has no monetary value.'],
            capWei: '100000000000000',
          },
        }),
      });

      const view = await renderComponent(
        <WalletProvider initialAdapter={adapter}>
          <SwapPage quoteDelayMs={0} />
        </WalletProvider>
      );

      const input = view.container.querySelector('[aria-label="You pay ETH"]') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, '0.0000005');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      const swapBtn = view.container.querySelector('[data-testid="swap-execution"]') as HTMLButtonElement;
      expect(swapBtn).not.toBeNull();
      expect(swapBtn.disabled).toBe(false);

      await act(async () => {
        swapBtn.click();
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
      }

      const actualReceived = view.container.querySelector('[data-testid="actual-received"]');
      expect(actualReceived).not.toBeNull();

      const swapResult = view.container.querySelector('[data-testid="swap-result"]');
      expect(swapResult).not.toBeNull();
      const addBtns = swapResult?.querySelectorAll('[data-testid="add-usdg-button"]');
      expect(addBtns?.length).toBe(1);

      const addBtnInResult = addBtns![0] as HTMLButtonElement;
      await act(async () => {
        addBtnInResult.click();
      });

      const statuses = view.container.querySelectorAll('[data-testid="add-usdg-status"]');
      expect(statuses.length).toBe(2);
      for (const st of statuses) {
        expect(st.textContent?.trim()).toBe('USDG added to your wallet');
      }

      await view.unmount();
    });
  });
});
