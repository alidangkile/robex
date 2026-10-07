/**
 * Simulated EIP-1193 provider / React runtime tests for Plan 002 review findings R1–R4.
 * These do not verify a real MetaMask or Rabby session.
 */
// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACTIVE_ACCOUNT = '0x9999999999999999999999999999999999999999';
const FRESH_ACCOUNT = '0x8888888888888888888888888888888888888888';
const STALE_ACCOUNT = '0x1111111111111111111111111111111111111111';

interface RequestArgs {
  method: string;
  params?: unknown;
}

type RequestHandler = (args: RequestArgs) => Promise<unknown>;

class FakeProvider {
  isMetaMask = true;
  readonly requests: string[] = [];
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  private requestHandler: RequestHandler;
  onCalls = 0;

  constructor(requestHandler: RequestHandler) {
    this.requestHandler = requestHandler;
  }

  setRequestHandler(requestHandler: RequestHandler): void {
    this.requestHandler = requestHandler;
  }

  request = async (args: RequestArgs): Promise<unknown> => {
    this.requests.push(args.method);
    return this.requestHandler(args);
  };

  on = (event: string, handler: (...args: unknown[]) => void): void => {
    this.onCalls += 1;
    const set = this.handlers.get(event) ?? new Set<(...args: unknown[]) => void>();
    set.add(handler);
    this.handlers.set(event, set);
  };

  removeListener = (event: string, handler: (...args: unknown[]) => void): void => {
    this.handlers.get(event)?.delete(handler);
  };

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      handler(...args);
    }
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function providerError(code: number, message: string): Error {
  const error = new Error(message) as Error & { code: number };
  error.code = code;
  return error;
}

function findButton(root: ParentNode, label: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll('button')).find((button) => {
    return (button.textContent || '').replace(/\s+/g, ' ').trim() === label;
  });
  if (!match) {
    const labels = Array.from(root.querySelectorAll('button')).map((button) => (button.textContent || '').trim());
    throw new Error(`Missing button "${label}". Have: ${labels.join(' | ')}`);
  }
  return match as HTMLButtonElement;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Plan 002 wallet lifecycle UI (simulated EIP-1193)', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  const unhandled: unknown[] = [];

  function onUnhandled(reason: unknown): void {
    unhandled.push(reason);
  }

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  });

  function renderApp(): HTMLDivElement {
    act(() => {
      root?.render(<App />);
    });
    return container as HTMLDivElement;
  }

  function accountRequests(provider: FakeProvider): number {
    return provider.requests.filter((method) => method === 'eth_requestAccounts').length;
  }

  it('R1: a connect held pending across provider disconnect cannot resurrect the old account', async () => {
    const held = deferred<string[]>();
    let phase: 'initial' | 'hold' | 'fresh' = 'initial';
    const provider = new FakeProvider(async ({ method }) => {
      if (method === 'eth_requestAccounts') {
        if (phase === 'initial') return [STALE_ACCOUNT];
        if (phase === 'hold') return held.promise;
        return [FRESH_ACCOUNT];
      }
      if (method === 'eth_chainId') return '0xb626';
      return null;
    });
    (window as unknown as { ethereum: unknown }).ethereum = provider;
    const view = renderApp();

    await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
    expect(view.textContent).toContain('0x1111...1111');

    await act(async () => {
      provider.emit('chainChanged', '0x1');
    });
    expect(view.textContent).toContain('Unsupported');

    phase = 'hold';
    expect(view.querySelector('#connect')).toBeNull();
    await act(async () => {
      const pending = (window as unknown as {
        __robexWallet: { adapter: { connect: () => Promise<unknown> } };
      }).__robexWallet.adapter.connect();
      pending.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connecting...').disabled).toBe(true);
    expect(accountRequests(provider)).toBe(2);
    expect(provider.listenerCount('disconnect')).toBe(1);

    await act(async () => {
      provider.emit('disconnect');
    });
    expect(view.textContent).not.toContain('0x1111...1111');
    expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet').disabled).toBe(false);

    const onCallsBeforeResolve = provider.onCalls;
    phase = 'fresh';
    await act(async () => {
      held.resolve([STALE_ACCOUNT]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.textContent).not.toContain('0x1111...1111');
    expect(view.textContent).not.toContain('0x8888...8888');
    expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet').disabled).toBe(false);
    expect(provider.onCalls).toBe(onCallsBeforeResolve);
    expect(unhandled).toEqual([]);

    await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
    expect(view.textContent).toContain('0x8888...8888');
    expect(accountRequests(provider)).toBe(3);
    expect(unhandled).toEqual([]);
  });

  it('R2: missing provider returns DISCONNECTED with a visible error and a later provider can connect once', async () => {
    const view = renderApp();
    const callout = () => view.querySelector('.callout') as HTMLElement;

    await click(findButton(callout(), 'Connect Wallet'));

    expect(callout().textContent).toContain('No browser wallet extension detected');
    const header = findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet');
    expect(header.disabled).toBe(false);
    const retry = findButton(callout(), 'Connect Wallet');
    expect(retry.disabled).toBe(false);

    const provider = new FakeProvider(async ({ method }) => {
      if (method === 'eth_requestAccounts') return [ACTIVE_ACCOUNT];
      if (method === 'eth_chainId') return '0xb626';
      return null;
    });
    (window as unknown as { ethereum: unknown }).ethereum = provider;

    await click(retry);
    expect(view.textContent).toContain('0x9999...9999');
    expect(view.textContent).not.toContain('No browser wallet extension detected');
    expect(accountRequests(provider)).toBe(1);
    expect(unhandled).toEqual([]);
  });

  it('R2: user rejection and unexpected connect failure reconcile to DISCONNECTED', async () => {
    const cases = [
      {
        name: '4001',
        reject: providerError(4001, 'User rejected the request.'),
        message: 'Connection request was rejected by user',
      },
      {
        name: 'unexpected',
        reject: new Error('Unexpected wallet failure'),
        message: 'Unexpected wallet failure',
      },
    ];

    for (const testCase of cases) {
      unhandled.length = 0;
      const provider = new FakeProvider(async ({ method }) => {
        if (method === 'eth_requestAccounts') throw testCase.reject;
        return null;
      });
      (window as unknown as { ethereum: unknown }).ethereum = provider;
      const view = renderApp();
      await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
      expect(view.textContent).toContain(testCase.message);
      expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet').disabled).toBe(false);
      expect(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet').disabled).toBe(false);
      expect(unhandled).toEqual([]);
      delete (window as unknown as { ethereum?: unknown }).ethereum;
      await act(async () => {
        root?.render(<div />);
      });
    }
  });

  it('R3: header and banner switch failures stay visible on the unsupported network', async () => {
    const cases: Array<{ mode: string; message: string }> = [
      { mode: 'switch-4001', message: 'Network switch was rejected by user' },
      { mode: 'add-4001', message: 'Adding network was rejected by user' },
      { mode: 'post-add-4001', message: 'Network switch was rejected by user' },
      { mode: 'generic', message: 'Provider request failed' },
    ];

    for (const entry of ['header', 'banner'] as const) {
      for (const testCase of cases) {
        unhandled.length = 0;
        let switchCalls = 0;
        const provider = new FakeProvider(async ({ method }) => {
          if (method === 'eth_requestAccounts') return [ACTIVE_ACCOUNT];
          if (method === 'eth_chainId') return '0x1';
          if (method === 'wallet_switchEthereumChain') {
            switchCalls += 1;
            if (testCase.mode === 'switch-4001') throw providerError(4001, 'rejected');
            if (testCase.mode === 'generic') throw new Error('Provider request failed');
            if (switchCalls === 1) throw providerError(4902, 'Unrecognized chain ID');
            if (testCase.mode === 'post-add-4001') throw providerError(4001, 'rejected');
            return null;
          }
          if (method === 'wallet_addEthereumChain') {
            if (testCase.mode === 'add-4001') throw providerError(4001, 'rejected add');
            return null;
          }
          return null;
        });
        (window as unknown as { ethereum: unknown }).ethereum = provider;
        const view = renderApp();
        await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
        expect(view.textContent).toContain('Unsupported');

        const button =
          entry === 'header'
            ? findButton(view.querySelector('.header-actions') as HTMLElement, 'Switch Network')
            : findButton(view.querySelector('.network-banner') as HTMLElement, 'Switch to Robinhood Chain Testnet');
        await click(button);

        const banner = view.querySelector('.network-banner');
        expect(banner?.textContent).toContain(testCase.message);
        expect(view.querySelector('.header-actions')?.textContent).toContain('Unsupported');
        expect(view.querySelector('.header-actions')?.textContent).toContain('Switch Network');
        expect(unhandled).toEqual([]);

        delete (window as unknown as { ethereum?: unknown }).ethereum;
        await act(async () => {
          root?.render(<div />);
        });
      }
    }
  });

  async function openPoolPositions(view: HTMLElement): Promise<HTMLElement> {
    await click(findButton(view.querySelector('nav.desktop-nav') as HTMLElement, 'Pool'));
    await click(findButton(view.querySelector('.main-content') as HTMLElement, 'My Positions'));
    return view.querySelector('.main-content') as HTMLElement;
  }

  it('R4: pool connect shows rejection, pending, unavailable, and success without a duplicate request', async () => {
    const rejectionCases = [
      { code: 4001, message: 'Connection request was rejected by user' },
      { code: -32002, message: 'Connection request already pending in wallet extension' },
    ];

    for (const testCase of rejectionCases) {
      unhandled.length = 0;
      const provider = new FakeProvider(async ({ method }) => {
        if (method === 'eth_requestAccounts') throw providerError(testCase.code, 'rejected');
        return null;
      });
      (window as unknown as { ethereum: unknown }).ethereum = provider;
      const view = renderApp();
      const main = await openPoolPositions(view);
      await click(findButton(main, 'Connect Wallet'));
      expect(main.textContent).toContain(testCase.message);
      expect(findButton(main, 'Connect Wallet').disabled).toBe(false);
      expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet').disabled).toBe(false);
      expect(unhandled).toEqual([]);
      delete (window as unknown as { ethereum?: unknown }).ethereum;
      await act(async () => {
        root?.render(<div />);
      });
    }

    unhandled.length = 0;
    const unavailableView = renderApp();
    const unavailableMain = await openPoolPositions(unavailableView);
    await click(findButton(unavailableMain, 'Connect Wallet'));
    expect(unavailableMain.textContent).toContain('No browser wallet extension detected');
    expect(findButton(unavailableMain, 'Connect Wallet').disabled).toBe(false);
    expect(findButton(unavailableView.querySelector('.header-actions') as HTMLElement, 'Connect Wallet').disabled).toBe(false);
    expect(unhandled).toEqual([]);

    const recovered = new FakeProvider(async ({ method }) => {
      if (method === 'eth_requestAccounts') return [ACTIVE_ACCOUNT];
      if (method === 'eth_chainId') return '0xb626';
      return null;
    });
    (window as unknown as { ethereum: unknown }).ethereum = recovered;
    await click(findButton(unavailableMain, 'Connect Wallet'));
    expect(unavailableView.textContent).toContain('Position Management Shell');
    expect(unavailableMain.textContent).not.toContain('No browser wallet extension detected');
    expect(accountRequests(recovered)).toBe(1);

    await act(async () => {
      root?.render(<div />);
    });
    delete (window as unknown as { ethereum?: unknown }).ethereum;

    const held = deferred<string[]>();
    const pendingProvider = new FakeProvider(async ({ method }) => {
      if (method === 'eth_requestAccounts') return held.promise;
      if (method === 'eth_chainId') return '0xb626';
      return null;
    });
    (window as unknown as { ethereum: unknown }).ethereum = pendingProvider;
    const pendingView = renderApp();
    const pendingMain = await openPoolPositions(pendingView);
    await click(findButton(pendingMain, 'Connect Wallet'));
    const pendingButton = findButton(pendingMain, 'Connecting...');
    expect(pendingButton.disabled).toBe(true);
    pendingButton.click();
    await settle();
    expect(accountRequests(pendingProvider)).toBe(1);

    await act(async () => {
      held.resolve([ACTIVE_ACCOUNT]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(pendingView.textContent).toContain('Position Management Shell');
    expect(accountRequests(pendingProvider)).toBe(1);
    expect(unhandled).toEqual([]);
  });
});
