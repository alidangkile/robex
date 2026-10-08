/**
 * Swap quote UI states. Wallet sessions here use the dev mock adapter, not a real extension.
 */
// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { formatBaseUnits } from '@robex/core';
import { WalletProvider } from '../src/wallet/wallet-context.js';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { SwapPage } from '../src/features/swap/SwapPage.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface PendingFetch {
  url: string;
  resolve: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
}

const pending: PendingFetch[] = [];
const urls: string[] = [];

function http(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function liveQuote(overrides: Record<string, unknown> = {}) {
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
    tokenInSymbol: 'ETH',
    tokenOutSymbol: 'USDG',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    poolId: '0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669',
    limitations: ['Testnet USDG has no monetary or redemption value.'],
    ...overrides,
  };
}

async function renderPage(adapter = new MockWalletAdapter()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <WalletProvider initialAdapter={adapter}>
        <SwapPage quoteDelayMs={0} />
      </WalletProvider>,
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

function inputOf(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('[aria-label="You pay ETH"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('pay input missing');
  return input;
}

async function typeAmount(container: HTMLElement, value: string) {
  const input = inputOf(container);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function flush(fetchIndex: number, status: number, body: unknown) {
  const item = pending[fetchIndex];
  if (!item) throw new Error(`missing fetch ${fetchIndex}`);
  await act(async () => {
    item.resolve(http(status, body));
  });
}

beforeEach(() => {
  pending.length = 0;
  urls.length = 0;
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(String(url));
    return new Promise((resolve) => {
      pending.push({ url: String(url), resolve });
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Swap read-only quote UI', () => {
  it('quotes while disconnected, keeps execution disabled, and labels USDG', async () => {
    const view = await renderPage();
    expect(urls).toHaveLength(0);
    expect(view.container.textContent).toContain('Testnet USDG has no monetary or redemption value.');
    expect(view.container.textContent).not.toContain('USDC');
    expect(view.container.textContent).not.toContain('SIMULATED');

    await typeAmount(view.container, '0.0000005');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('tokenOut=0x7E955252E15c84f5768B83c41a71F9eba181802F');
    expect(urls[0]).toContain('amountIn=500000000000');
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Calculating...');

    await flush(0, 200, { quote: liveQuote() });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
    expect(view.container.textContent).toContain('Uniswap v4');
    expect(view.container.textContent).toContain('starts at the chain block time');
    expect(view.container.querySelector('[data-block-hash]')?.getAttribute('data-block-hash')).toBe(
      '0xba68078cd40540f60f2fc104d9006020190cf63abb5d03a713ad396fb170f034',
    );
    const execution = view.container.querySelector('[data-testid="swap-execution"]');
    expect(execution).toBeInstanceOf(HTMLButtonElement);
    expect((execution as HTMLButtonElement).disabled).toBe(true);
    expect(execution?.textContent).toContain('later milestone');
    await view.unmount();
  });

  it('does not call the API for empty, invalid, overly precise, or above-cap input', async () => {
    const view = await renderPage();
    await typeAmount(view.container, 'abc');
    await typeAmount(view.container, '0');
    await typeAmount(view.container, '0.00000000000000000001');
    await typeAmount(view.container, '0.0002');
    expect(urls).toHaveLength(0);
    expect(view.container.textContent).toContain('The read-only limit is 0.0001 ETH.');
    await view.unmount();
  });

  it('drops a late response after the amount changes', async () => {
    const view = await renderPage();
    await typeAmount(view.container, '0.0000005');
    await typeAmount(view.container, '0.0000004');
    expect(urls).toHaveLength(2);
    await flush(1, 200, { quote: liveQuote({ expectedAmountOut: '900', minimumAmountOut: '895', amountIn: '400000000000' }) });
    await flush(0, 200, { quote: liveQuote({ expectedAmountOut: '1111' }) });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(900n, 6));
    expect(view.container.textContent).not.toContain(formatBaseUnits(1111n, 6));
    await view.unmount();
  });

  it('clears the quote on the wrong network and asks for a switch', async () => {
    const adapter = new MockWalletAdapter();
    const view = await renderPage(adapter);
    await typeAmount(view.container, '0.0000005');
    await flush(0, 200, { quote: liveQuote() });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));

    await act(async () => {
      await adapter.connect();
      await adapter.switchChain(1);
    });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
    expect(view.container.textContent).toContain('Switch network');
    expect(view.container.querySelector('[data-testid="swap-execution"]')).toBeNull();

    const callsBefore = urls.length;
    await typeAmount(view.container, '0.0000004');
    expect(urls).toHaveLength(callsBefore);
    await view.unmount();
  });

  it('invalidates an in-flight quote when the account changes and quotes again while disconnected', async () => {
    const adapter = new MockWalletAdapter();
    const view = await renderPage(adapter);
    await act(async () => {
      await adapter.connect();
    });
    await typeAmount(view.container, '0.0000005');
    const first = urls.length - 1;
    await act(async () => {
      adapter.simulateAccountChange('0xabcabcabcabcabcabcabcabcabcabcabcabcabca');
    });
    const second = urls.length - 1;
    expect(second).toBeGreaterThan(first);
    await flush(second, 200, { quote: liveQuote({ expectedAmountOut: '2222' }) });
    await flush(first, 200, { quote: liveQuote({ expectedAmountOut: '1111' }) });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(2222n, 6));

    const beforeDisconnect = urls.length;
    await act(async () => {
      await adapter.disconnect();
    });
    expect(urls.length).toBeGreaterThan(beforeDisconnect);
    await view.unmount();
  });

  it('shows a warning quote, blocks excessive impact without the received amount, and expires the figure', async () => {
    const view = await renderPage();
    await typeAmount(view.container, '0.0000005');
    await flush(0, 200, { quote: liveQuote({ risk: 'warning', priceImpactPercent: 1.25, priceImpactPercentExact: '1.2500' }) });
    expect(view.container.querySelector('[data-testid="quote-warning"]')?.textContent).toContain('1.2500%');
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));

    await typeAmount(view.container, '0.0000006');
    await flush(1, 400, {
      error: {
        code: 'QUOTE_ERROR',
        message: 'Price impact is 4.3512%, above the 2% limit. This is not a valid quote.',
        details: { reason: 'PRICE_IMPACT', priceImpactPercent: '4.3512', quotedAmountOut: '214711' },
      },
    });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Blocked');
    expect(view.container.querySelector('[data-testid="blocked-impact"]')?.textContent).toContain('4.3512%');
    expect(view.container.textContent).not.toContain('0.214711');

    await typeAmount(view.container, '0.0000004');
    await flush(2, 200, { quote: liveQuote({ expiresAt: Date.now() - 1, expectedAmountOut: '800', minimumAmountOut: '796', amountIn: '400000000000' }) });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
    expect(view.container.querySelector('[data-testid="quote-expired"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain(formatBaseUnits(800n, 6));
    await view.unmount();
  });

  it('hides a quote whose chain block is stale or ahead of this device clock', async () => {
    const view = await renderPage();
    const staleSec = Math.floor(Date.now() / 1000) - 30;
    await typeAmount(view.container, '0.0000005');
    await flush(0, 200, {
      quote: liveQuote({
        blockTimestamp: String(staleSec),
        quotedAt: Date.now(),
        expiresAt: Date.now() + 20_000,
        expectedAmountOut: '1122',
      }),
    });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
    expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toContain('outside the 20-second');
    expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));

    await typeAmount(view.container, '0.0000004');
    await flush(1, 200, {
      quote: liveQuote({
        blockTimestamp: String(Math.floor(Date.now() / 1000) + 30),
        quotedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        expectedAmountOut: '900',
        minimumAmountOut: '895',
        amountIn: '400000000000',
      }),
    });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
    expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toContain('ahead of the quote clock');
    expect(view.container.textContent).not.toContain(formatBaseUnits(900n, 6));
    await view.unmount();
  });

  it('shows a provider failure and retries on refresh', async () => {
    const view = await renderPage();
    await typeAmount(view.container, '0.0000005');
    await flush(0, 500, {
      error: { code: 'PROVIDER_ERROR', message: 'The read-only RPC request timed out.', details: { reason: 'TIMEOUT' } },
    });
    expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toContain('timed out');
    const refresh = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Refresh quote');
    expect(refresh).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(urls.length).toBeGreaterThan(1);
    await view.unmount();
  });

  it('expires at the block deadline when the API expiry is an hour later', async () => {
    const start = 1_700_000_019_999;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000) - 19;
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 3_600_000,
        }),
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('1s');
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).not.toContain('3600s');

      now.mockReturnValue(blockMs + 20_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
      await view.unmount();
    } finally {
      now.mockRestore();
      intervalSpy.mockRestore();
    }
  });

  it.each([
    ['fee-adjusted reference', { referenceAmountOut: 'bad' }, /fee-adjusted reference/, 'bad'],
    ['price impact text', { priceImpactPercentExact: 'not-a-percent' }, /price impact text/, 'not-a-percent'],
    ['spot reference', { referenceRate: 'not-a-rate' }, /spot reference/, 'not-a-rate'],
  ] as const)('rejects a fresh matching quote whose %s is not numeric', async (_label, override, message, leaked) => {
    const view = await renderPage();
    await typeAmount(view.container, '0.0000005');
    await flush(0, 200, { quote: liveQuote(override) });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
    expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toMatch(message);
    expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
    expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
    expect(view.container.textContent).not.toContain(leaked);
    await view.unmount();
  });

  it.each([
    ['chain', { chainId: 1 }, /different chain/],
    ['token in', { tokenIn: '0x0000000000000000000000000000000000000009' }, /token pair/],
    ['token out', { tokenOut: '0x0000000000000000000000000000000000000008' }, /token pair/],
    ['amount', { amountIn: '999' }, /amount does not match/],
    ['slippage', { slippageBps: 100 }, /slippage does not match/],
    ['pool', { poolId: `0x${'ab'.repeat(32)}` }, /pool does not match/],
    ['minimum', { minimumAmountOut: '2000' }, /minimum received is above/],
  ] as const)('rejects a fresh response whose %s does not match this request', async (_label, override, message) => {
    const view = await renderPage();
    await typeAmount(view.container, '0.0000005');
    await flush(0, 200, { quote: liveQuote(override) });
    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
    expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toMatch(message);
    expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
    expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
    await view.unmount();
  });
});
