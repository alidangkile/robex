/**
 * Swap quote UI states. Wallet sessions here use the dev mock adapter, not a real extension.
 */
// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { formatBaseUnits } from '@robex/core';
import { WalletProvider } from '../src/wallet/wallet-context.js';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { SwapPage, parseSlippagePercentInput } from '../src/features/swap/SwapPage.js';

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

async function renderPage(
  adapter = new MockWalletAdapter(),
  pageProps: { quoteDelayMs?: number; readMonotonic?: () => number | undefined } = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <WalletProvider initialAdapter={adapter}>
        <SwapPage quoteDelayMs={0} {...pageProps} />
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

async function typeCustomSlippage(container: HTMLElement, value: string) {
  const input = container.querySelector('[data-testid="custom-slippage-input"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('custom slippage input missing');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickElement(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) throw new Error('element missing');
  await act(async () => {
    el.click();
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

  it('QA14-02: does not revive an expired quote when clock is rolled back after 20s expiry', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')).not.toBeNull();

      // Advance to B + 20s -> expires
      now.mockReturnValue(blockMs + 20_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')).not.toBeNull();
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));

      // Rollback to B + 1s -> must NOT revive!
      now.mockReturnValue(blockMs + 1_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')).not.toBeNull();
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));

      // Rollback to B - 1s -> must NOT revive!
      now.mockReturnValue(blockMs - 1_000);
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

  it('QA14-02: clamps 1-hour API expiry to 20s and does not revive after clock rollback to B+5s', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 3_600_000,
        }),
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('20s');

      // Advance to B + 20s -> expires
      now.mockReturnValue(blockMs + 20_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();

      // Rollback to B + 5s -> must NOT revive!
      now.mockReturnValue(blockMs + 5_000);
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

  it('QA14-02: terminally invalidates the quote when clock is rolled back before chain block time', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));

      // Rollback to B - 1s (before block time) -> terminally invalid
      now.mockReturnValue(blockMs - 1_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')?.textContent).toContain('device clock changed');
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));

      // Subsequent advance to B + 10s -> must NOT revive!
      now.mockReturnValue(blockMs + 10_000);
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

  it('QA14-02: terminally invalidates the quote when clock is rolled back before expiry deadline', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });

      // Advance to B + 5s -> valid, countdown 15s
      now.mockReturnValue(blockMs + 5_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('15s');

      // Backward clock jump to B + 1s -> terminally invalid
      now.mockReturnValue(blockMs + 1_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')?.textContent).toContain('device clock changed');
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));

      // Subsequent advance to B + 2s -> must NOT revive!
      now.mockReturnValue(blockMs + 2_000);
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

  it('QA14-02: explicit Refresh returns a fresh valid quote and does not revive the old quote', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });

      // Expire and rollback
      now.mockReturnValue(blockMs + 20_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      now.mockReturnValue(blockMs + 1_000);
      await act(async () => {
        intervals.forEach((run) => run());
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();

      // Click Refresh quote
      const refreshBtn = [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Refresh quote');
      expect(refreshBtn).toBeDefined();

      const newBlockSec = blockSec + 30;
      const newBlockMs = newBlockSec * 1000;
      now.mockReturnValue(newBlockMs);

      await act(async () => {
        refreshBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(urls.length).toBe(2);

      await flush(1, 200, {
        quote: liveQuote({
          expectedAmountOut: '1125',
          minimumAmountOut: '1119',
          blockTimestamp: String(newBlockSec),
          quotedAt: newBlockMs,
          expiresAt: newBlockMs + 20_000,
        }),
      });

      // Fresh quote is shown!
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1125n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')).not.toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')).toBeNull();
      await view.unmount();
    } finally {
      now.mockRestore();
      intervalSpy.mockRestore();
    }
  });

  it('QA14-02: fails closed when interval is delayed and wall clock rolls back across unobserved expiry', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    let monoCurrent = 10_000;
    const monoSpy = vi.spyOn(performance, 'now').mockImplementation(() => monoCurrent);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')).not.toBeNull();

      // 1. Monotonic elapsed time advances 21 seconds (real elapsed time exceeds 20s budget)
      // BUT interval is delayed/throttled and DOES NOT RUN yet!
      monoCurrent += 21_000;

      // 2. Wall clock is rolled back to B + 1_000 before the interval runs
      now.mockReturnValue(blockMs + 1_000);

      // 3. Delayed interval callback finally executes
      await act(async () => {
        intervals.forEach((run) => run());
      });

      // Must be Expired! Stale quote must NOT revive! Details hidden!
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')).not.toBeNull();
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));

      await view.unmount();
    } finally {
      now.mockRestore();
      monoSpy.mockRestore();
      intervalSpy.mockRestore();
    }
  });

  it('QA14-02: fails closed on late-arriving response after remaining budget elapses under delayed interval', async () => {
    const start = 1_700_000_005_000; // Arrived 5s after block
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    let monoCurrent = 10_000;
    const monoSpy = vi.spyOn(performance, 'now').mockImplementation(() => monoCurrent);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000) - 5;
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });
      // Remaining budget is only 15s (20s - 5s elapsed at arrival)
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('15s');

      // Monotonic advances 16s (exhausts the 15s remaining budget) without interval
      monoCurrent += 16_000;
      now.mockReturnValue(blockMs + 6_000); // Wall clock held back

      await act(async () => {
        intervals.forEach((run) => run());
      });

      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      await view.unmount();
    } finally {
      now.mockRestore();
      monoSpy.mockRestore();
      intervalSpy.mockRestore();
    }
  });

  it('QA14-02: immediately expires on visibilitychange / window focus after suspension without waiting for interval', async () => {
    const start = 1_700_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    let monoCurrent = 10_000;
    const monoSpy = vi.spyOn(performance, 'now').mockImplementation(() => monoCurrent);

    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      const blockSec = Math.floor(start / 1000);
      const blockMs = blockSec * 1000;
      await flush(0, 200, {
        quote: liveQuote({
          blockTimestamp: String(blockSec),
          quotedAt: blockMs,
          expiresAt: blockMs + 20_000,
        }),
      });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));

      // User switched tab: 21s elapsed, wall clock rolled back to B+1s
      monoCurrent += 21_000;
      now.mockReturnValue(blockMs + 1_000);

      // User returns to tab: visibilitychange event fires! (No interval needed)
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      await view.unmount();
    } finally {
      now.mockRestore();
      monoSpy.mockRestore();
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

  it('QA14-02: rejects quote at acceptance when performance.now() returns NaN and keeps UI fail-closed without NaNs', async () => {
    const monoSpy = vi.spyOn(performance, 'now').mockReturnValue(Number.NaN);
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 200, { quote: liveQuote() });

      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
      expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toMatch(/device clock is not usable/);
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.textContent).not.toContain('NaN');
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
      await view.unmount();
    } finally {
      monoSpy.mockRestore();
    }
  });

  it.each([
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['negative number', -1],
  ] as const)('QA14-02: rejects quote at acceptance when performance.now() returns %s and hides details', async (_label, invalidValue) => {
    const monoSpy = vi.spyOn(performance, 'now').mockReturnValue(invalidValue);
    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 200, { quote: liveQuote() });

      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
      expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toMatch(/device clock is not usable/);
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.textContent).not.toContain('NaN');
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
      await view.unmount();
    } finally {
      monoSpy.mockRestore();
    }
  });

  it('QA14-02: rejects quote at acceptance when performance.now is unavailable', async () => {
    const view = await renderPage(new MockWalletAdapter(), { readMonotonic: () => undefined });
    await typeAmount(view.container, '0.0000005');
    await flush(0, 200, { quote: liveQuote() });

    expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
    expect(view.container.querySelector('[data-testid="quote-error"]')?.textContent).toMatch(/device clock is not usable/);
    expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
    expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
    await view.unmount();
  });

  it('QA14-02: transitions to clock_invalid and hides details without NaNs when performance.now() becomes NaN after acceptance', async () => {
    let monoCurrent = 10_000;
    const monoSpy = vi.spyOn(performance, 'now').mockImplementation(() => monoCurrent);
    const intervals: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervals.push(() => { handler(); });
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    try {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 200, { quote: liveQuote() });

      // Valid quote displayed
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(view.container.querySelector('[data-testid="quote-details"]')).not.toBeNull();
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).not.toContain('NaNs');

      // Monotonic clock malfunctions and returns NaN
      monoCurrent = Number.NaN;

      await act(async () => {
        intervals.forEach((run) => run());
      });

      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('Expired');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="quote-expired"]')?.textContent).toMatch(/device clock changed or is not usable/);
      expect(view.container.textContent).not.toContain('NaN');
      expect(view.container.textContent).not.toContain(formatBaseUnits(1122n, 6));
      await view.unmount();
    } finally {
      monoSpy.mockRestore();
      intervalSpy.mockRestore();
    }
  });

  describe('HA-14 Acceptance: FUTURE_BLOCK, Custom Slippage, and Status Typography', () => {
    it('HA-14-01: displays clear advice to synchronize system clock when API returns FUTURE_BLOCK', async () => {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 400, {
        error: {
          message: 'The pinned chain block timestamp is ahead of the quote clock. No quote is available.',
          details: { reason: 'FUTURE_BLOCK' },
        },
      });

      const errorEl = view.container.querySelector('[data-testid="quote-error"]');
      expect(errorEl?.textContent).toContain('ahead of the quote clock');
      expect(errorEl?.textContent).toContain('system clock is synchronized with network time');
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
      await view.unmount();
    });

    it('HA-14-02: parseSlippagePercentInput correctly parses, validates, and warns without silent rounding', () => {
      // Valid inputs
      expect(parseSlippagePercentInput('0.5')).toEqual({ status: 'ok', percent: 0.5, bps: 50, queryParam: '0.5', warning: undefined });
      expect(parseSlippagePercentInput('0.1')).toEqual({ status: 'ok', percent: 0.1, bps: 10, queryParam: '0.1', warning: undefined });
      expect(parseSlippagePercentInput('1')).toEqual({ status: 'ok', percent: 1, bps: 100, queryParam: '1', warning: undefined });
      expect(parseSlippagePercentInput('1.00')).toEqual({ status: 'ok', percent: 1, bps: 100, queryParam: '1', warning: undefined });
      expect(parseSlippagePercentInput('0.05')).toEqual({ status: 'ok', percent: 0.05, bps: 5, queryParam: '0.05', warning: undefined });

      // 0% notice
      const zero = parseSlippagePercentInput('0');
      expect(zero.status).toBe('ok');
      if (zero.status === 'ok') {
        expect(zero.percent).toBe(0);
        expect(zero.bps).toBe(0);
        expect(zero.queryParam).toBe('0');
        expect(zero.warning).toMatch(/0% slippage may cause transactions to fail/);
      }

      // >1% warning
      const high = parseSlippagePercentInput('2.5');
      expect(high.status).toBe('ok');
      if (high.status === 'ok') {
        expect(high.percent).toBe(2.5);
        expect(high.bps).toBe(250);
        expect(high.queryParam).toBe('2.5');
        expect(high.warning).toMatch(/High slippage tolerance increases the risk/);
      }

      // Max 50%
      const max = parseSlippagePercentInput('50.00');
      expect(max.status).toBe('ok');
      if (max.status === 'ok') {
        expect(max.percent).toBe(50);
        expect(max.bps).toBe(5000);
      }

      // Invalid inputs rejected without silent rounding
      expect(parseSlippagePercentInput('')).toEqual({ status: 'invalid', message: 'Enter a slippage tolerance between 0% and 50%.' });
      expect(parseSlippagePercentInput('   ')).toEqual({ status: 'invalid', message: 'Enter a slippage tolerance between 0% and 50%.' });
      expect(parseSlippagePercentInput('0.125')).toEqual({ status: 'invalid', message: 'Slippage cannot have more than 2 decimal places.' });
      expect(parseSlippagePercentInput('50.01')).toEqual({ status: 'invalid', message: 'Slippage tolerance cannot exceed 50%.' });
      expect(parseSlippagePercentInput('100')).toEqual({ status: 'invalid', message: 'Slippage tolerance cannot exceed 50%.' });
      expect(parseSlippagePercentInput('-1')).toEqual({ status: 'invalid', message: 'Slippage must be a valid number between 0% and 50%.' });
      expect(parseSlippagePercentInput('abc')).toEqual({ status: 'invalid', message: 'Slippage must be a valid number between 0% and 50%.' });
    });

    it('HA-14-02: preset slippage buttons (0.1%, 0.5%, 1%) update fetch query and accepted quote verification', async () => {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      expect(urls[0]).toContain('slippage=0.5');
      await flush(0, 200, { quote: liveQuote({ slippageBps: 50 }) });

      // Click 0.1% preset
      await clickElement(view.container.querySelector('[data-testid="slippage-preset-0.1"]'));
      expect(urls[1]).toContain('slippage=0.1');
      await flush(1, 200, { quote: liveQuote({ slippageBps: 10 }) });
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('0.1%');

      // Click 1% preset
      await clickElement(view.container.querySelector('[data-testid="slippage-preset-1"]'));
      expect(urls[2]).toContain('slippage=1');
      await flush(2, 200, { quote: liveQuote({ slippageBps: 100 }) });
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('1%');

      await view.unmount();
    });

    it('HA-14-02: custom slippage toggle allows custom percentage input and shows risk warning for >1%', async () => {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 200, { quote: liveQuote({ slippageBps: 50 }) });

      // Toggle custom
      await clickElement(view.container.querySelector('[data-testid="custom-slippage-toggle"]'));
      const customInput = view.container.querySelector('[data-testid="custom-slippage-input"]');
      expect(customInput).not.toBeNull();

      // Type 2.5%
      await typeCustomSlippage(view.container, '2.5');
      expect(view.container.querySelector('[data-testid="slippage-warning"]')?.textContent).toMatch(/High slippage tolerance increases the risk/);
      expect(urls[1]).toContain('slippage=2.5');
      await flush(1, 200, { quote: liveQuote({ slippageBps: 250 }) });
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('2.5%');

      await view.unmount();
    });

    it('HA-14-02: custom slippage 0% sends slippage=0 and displays execution warning', async () => {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 200, { quote: liveQuote({ slippageBps: 50 }) });

      await clickElement(view.container.querySelector('[data-testid="custom-slippage-toggle"]'));
      await typeCustomSlippage(view.container, '0');
      expect(view.container.querySelector('[data-testid="slippage-warning"]')?.textContent).toMatch(/0% slippage may cause transactions to fail/);
      expect(urls[1]).toContain('slippage=0');
      await flush(1, 200, { quote: liveQuote({ slippageBps: 0 }) });
      expect(view.container.querySelector('[data-testid="quote-details"]')?.textContent).toContain('0%');

      await view.unmount();
    });

    it('HA-14-02: rejects invalid custom slippage without fetching, clears quote, and shows inline error', async () => {
      const view = await renderPage();
      await typeAmount(view.container, '0.0000005');
      await flush(0, 200, { quote: liveQuote({ slippageBps: 50 }) });
      const fetchCountBefore = urls.length;

      await clickElement(view.container.querySelector('[data-testid="custom-slippage-toggle"]'));

      // Test 55% (>50%)
      await typeCustomSlippage(view.container, '55');
      expect(view.container.querySelector('[data-testid="slippage-error"]')?.textContent).toBe('Slippage tolerance cannot exceed 50%.');
      expect(urls.length).toBe(fetchCountBefore); // No new fetch
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe('--');
      expect(view.container.querySelector('[data-testid="quote-details"]')).toBeNull();

      // Test 0.125 (>2 decimals)
      await typeCustomSlippage(view.container, '0.125');
      expect(view.container.querySelector('[data-testid="slippage-error"]')?.textContent).toBe('Slippage cannot have more than 2 decimal places.');
      expect(urls.length).toBe(fetchCountBefore);

      // Test empty string
      await typeCustomSlippage(view.container, '');
      expect(view.container.querySelector('[data-testid="slippage-error"]')?.textContent).toBe('Enter a slippage tolerance between 0% and 50%.');
      expect(urls.length).toBe(fetchCountBefore);

      // Switching back to preset restores valid quote fetching
      await clickElement(view.container.querySelector('[data-testid="slippage-preset-0.5"]'));
      expect(view.container.querySelector('[data-testid="slippage-error"]')).toBeNull();
      expect(urls.length).toBe(fetchCountBefore + 1);
      expect(urls[fetchCountBefore]).toContain('slippage=0.5');
      await flush(fetchCountBefore, 200, { quote: liveQuote({ slippageBps: 50 }) });
      expect(view.container.querySelector('[data-testid="quote-receive"]')?.textContent).toBe(formatBaseUnits(1122n, 6));

      await view.unmount();
    });

    it('HA-14-03: status typography uses smaller scale for status messages and large bold font for actual quote', async () => {
      const view = await renderPage();
      const receiveEl = view.container.querySelector('[data-testid="quote-receive"]');

      // Empty amount: status '--'
      expect(receiveEl?.textContent).toBe('--');
      expect(receiveEl?.classList.contains('quote-status-display')).toBe(true);
      expect(receiveEl?.getAttribute('style')).toContain('font-weight: 600');
      expect(receiveEl?.getAttribute('style')).toContain('color: var(--text-secondary)');

      // Typing amount: status 'Calculating...'
      await typeAmount(view.container, '0.0000005');
      expect(receiveEl?.textContent).toBe('Calculating...');
      expect(receiveEl?.classList.contains('quote-status-display')).toBe(true);
      expect(receiveEl?.getAttribute('style')).toContain('font-weight: 600');
      expect(receiveEl?.getAttribute('style')).toContain('color: var(--text-secondary)');

      // Quote arrives: real token amount
      await flush(0, 200, { quote: liveQuote() });
      expect(receiveEl?.textContent).toBe(formatBaseUnits(1122n, 6));
      expect(receiveEl?.classList.contains('quote-amount-display')).toBe(true);
      expect(receiveEl?.getAttribute('style')).toContain('font-weight: 700');
      expect(receiveEl?.getAttribute('style')).toContain('color: var(--text-primary)');

      await view.unmount();
    });
  });
});
