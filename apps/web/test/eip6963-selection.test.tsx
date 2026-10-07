/**
 * Simulated EIP-6963 provider selection.
 * Not real MetaMask, OKX, or Rabby extension evidence.
 */
// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App.js';
import {
  resetEip6963DiscoveryForTests,
  startEip6963Discovery,
  type Eip6963ProviderInfo,
} from '../src/wallet/eip6963-discovery.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface TrackedWallet {
  info: Eip6963ProviderInfo;
  requests: string[];
  provider: {
    isMetaMask?: boolean;
    isOkxWallet?: boolean;
    request: (args: { method: string }) => Promise<unknown>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  };
  listenerCount: (event: string) => number;
}

function trackedWallet(info: Eip6963ProviderInfo, address: string, chainId = '0xb626'): TrackedWallet {
  const requests: string[] = [];
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const provider = {
    isMetaMask: info.rdns === 'io.metamask',
    isOkxWallet: info.rdns === 'com.okex.wallet' ? true : undefined,
    request: vi.fn(async ({ method }: { method: string }) => {
      requests.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return chainId;
      return null;
    }),
    on(event: string, handler: (...args: unknown[]) => void) {
      const set = handlers.get(event) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      handlers.set(event, set);
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
    },
  };
  return {
    info,
    requests,
    provider,
    listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
  };
}

function announce(wallet: TrackedWallet): void {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info: wallet.info, provider: wallet.provider }),
  }));
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

function findButtonContaining(root: ParentNode, label: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll('button')).find((button) => (button.textContent || '').includes(label));
  if (!match) throw new Error(`Missing button containing "${label}"`);
  return match as HTMLButtonElement;
}

async function emit(run: () => void): Promise<void> {
  await act(async () => {
    run();
  });
}

async function click(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const METAMASK_INFO: Eip6963ProviderInfo = {
  uuid: 'meta-mask-uuid',
  name: 'MetaMask',
  icon: '',
  rdns: 'io.metamask',
};
const OKX_INFO: Eip6963ProviderInfo = {
  uuid: 'okx-uuid',
  name: 'OKX Wallet',
  icon: '',
  rdns: 'com.okex.wallet',
};
const METAMASK_ACCOUNT = '0x1111111111111111111111111111111111111111';
const OKX_ACCOUNT = '0x2222222222222222222222222222222222222222';

describe('EIP-6963 wallet selection', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  const unhandled: unknown[] = [];

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', (reason) => unhandled.push(reason));
    resetEip6963DiscoveryForTests();
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    startEip6963Discovery();
  });

  afterEach(() => {
    process.removeAllListeners('unhandledRejection');
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    resetEip6963DiscoveryForTests();
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  });

  function renderApp(): HTMLDivElement {
    act(() => {
      root?.render(<App />);
    });
    return container as HTMLDivElement;
  }

  it('T1/T2: lists both wallets and connects only the selected OKX provider', async () => {
    const metamask = trackedWallet(METAMASK_INFO, METAMASK_ACCOUNT);
    const okx = trackedWallet({ ...OKX_INFO, icon: '' }, OKX_ACCOUNT);
    okx.provider.isMetaMask = true;
    announce(metamask);
    announce(metamask);
    announce(okx);
    const view = renderApp();

    await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
    expect(metamask.requests).toEqual([]);
    expect(okx.requests).toEqual([]);
    const modal = view.querySelector('.modal-content') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(findButtonContaining(modal, 'MetaMask')).toBeTruthy();
    expect(findButtonContaining(modal, 'OKX Wallet')).toBeTruthy();
    expect(Array.from(modal.querySelectorAll('button')).filter((button) => (button.textContent || '').includes('MetaMask'))).toHaveLength(1);
    expect(modal.textContent).not.toContain('Legacy injected provider');

    await click(findButtonContaining(modal, 'OKX Wallet'));
    expect(view.textContent).toContain('OKX Wallet');
    expect(view.textContent).toContain('0x2222...2222');
    expect(view.textContent).not.toContain('0x1111...1111');
    expect(okx.requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
    expect(metamask.requests).toEqual([]);
    expect(okx.listenerCount('chainChanged')).toBe(1);
    expect(metamask.listenerCount('chainChanged')).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it('T3/T4/T5: OKX events update state and MetaMask events do not; disconnect stays disconnected', async () => {
    const metamask = trackedWallet(METAMASK_INFO, METAMASK_ACCOUNT);
    const okx = trackedWallet(OKX_INFO, OKX_ACCOUNT);
    announce(metamask);
    announce(okx);
    const view = renderApp();
    await click(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet'));
    await click(findButtonContaining(view.querySelector('.modal-content') as HTMLElement, 'OKX Wallet'));
    expect(view.textContent).toContain('0x2222...2222');

    await emit(() => okx.provider.emit('chainChanged', '0x1'));
    expect(view.textContent).toContain('Unsupported');
    expect(view.textContent).toContain('Switch Network');
    expect(view.textContent).toContain('OKX Wallet');

    await emit(() => {
      metamask.provider.emit('chainChanged', '0xb608');
      metamask.provider.emit('accountsChanged', ['0x3333333333333333333333333333333333333333']);
    });
    expect(view.textContent).toContain('Unsupported');
    expect(view.textContent).toContain('0x2222...2222');
    expect(view.textContent).not.toContain('0x3333...3333');

    await emit(() => okx.provider.emit('accountsChanged', ['0x4444444444444444444444444444444444444444']));
    expect(view.textContent).toContain('0x4444...4444');

    await emit(() => okx.provider.emit('disconnect'));
    expect(view.textContent).not.toContain('0x4444...4444');
    expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet')).toBeTruthy();

    await emit(() => {
      okx.provider.emit('accountsChanged', [OKX_ACCOUNT]);
      okx.provider.emit('chainChanged', '0xb626');
    });
    expect(view.textContent).not.toContain('0x2222...2222');
    expect(view.textContent).not.toContain('0x4444...4444');
    expect(okx.listenerCount('accountsChanged')).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it('T6: disconnect MetaMask then select OKX removes the previous listeners and identity', async () => {
    const metamask = trackedWallet(METAMASK_INFO, METAMASK_ACCOUNT);
    const okx = trackedWallet(OKX_INFO, OKX_ACCOUNT);
    announce(metamask);
    announce(okx);
    const view = renderApp();

    await click(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet'));
    await click(findButtonContaining(view.querySelector('.modal-content') as HTMLElement, 'MetaMask'));
    expect(view.textContent).toContain('MetaMask');
    expect(view.textContent).toContain('0x1111...1111');
    expect(metamask.listenerCount('accountsChanged')).toBe(1);

    await click(findButton(view.querySelector('.header-actions') as HTMLElement, 'Disconnect'));
    expect(metamask.listenerCount('accountsChanged')).toBe(0);
    expect(view.textContent).not.toContain('0x1111...1111');

    await click(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet'));
    await click(findButtonContaining(view.querySelector('.modal-content') as HTMLElement, 'OKX Wallet'));
    expect(view.textContent).toContain('OKX Wallet');
    expect(view.textContent).toContain('0x2222...2222');
    expect(view.textContent).not.toContain('0x1111...1111');
    expect(okx.listenerCount('chainChanged')).toBe(1);
    expect(metamask.listenerCount('chainChanged')).toBe(0);
    expect(metamask.requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
    expect(okx.requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
    expect(unhandled).toEqual([]);
  });

  it('T7: legacy window.ethereum is offered as Browser Wallet when nothing announces', async () => {
    const requests: string[] = [];
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: vi.fn(async ({ method }: { method: string }) => {
        requests.push(method);
        if (method === 'eth_requestAccounts') return [METAMASK_ACCOUNT];
        if (method === 'eth_chainId') return '0xb626';
        return null;
      }),
      on(event: string, handler: (...args: unknown[]) => void) {
        const set = handlers.get(event) ?? new Set<(...args: unknown[]) => void>();
        set.add(handler);
        handlers.set(event, set);
      },
      removeListener() {},
    };
    const view = renderApp();
    await click(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet'));
    const modal = view.querySelector('.modal-content') as HTMLElement;
    expect(modal.textContent).toContain('Browser Wallet');
    expect(modal.textContent).toContain('Legacy injected provider');
    expect(modal.textContent).not.toContain('EIP-6963 ·');
    await click(findButtonContaining(modal, 'Browser Wallet'));
    expect(view.textContent).toContain('0x1111...1111');
    expect(requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
    expect(unhandled).toEqual([]);
  });

  it('T8: no provider stays retryable and does not invent a wallet', async () => {
    const view = renderApp();
    await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
    expect(view.textContent).toContain('No browser wallet extension detected');
    expect(findButton(view.querySelector('.header-actions') as HTMLElement, 'Connect Wallet').disabled).toBe(false);
    expect(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet').disabled).toBe(false);

    const requests: string[] = [];
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: vi.fn(async ({ method }: { method: string }) => {
        requests.push(method);
        if (method === 'eth_requestAccounts') return [OKX_ACCOUNT];
        if (method === 'eth_chainId') return '0xb626';
        return null;
      }),
      on() {},
      removeListener() {},
    };
    await click(findButton(view.querySelector('.callout') as HTMLElement, 'Connect Wallet'));
    expect(view.textContent).toContain('0x2222...2222');
    expect(view.textContent).not.toContain('No browser wallet extension detected');
    expect(requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
    expect(unhandled).toEqual([]);
  });
});
