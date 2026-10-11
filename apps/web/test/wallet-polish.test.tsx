/**
 * Comprehensive tests for Issue #32: Wallet Polish
 * W4: Auto-reconnect on page load via eth_accounts
 * W5: Wallet-specific error messages (no hardcoded MetaMask)
 * W6: Address and chainId validation
 * W9: Cleaner picker UI (Detected badge, subtitle, dev-only EIP-6963 badge)
 */
// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/App.js';
import {
  InjectedWalletAdapter,
} from '../src/wallet/injected-wallet-adapter.js';
import {
  LAST_WALLET_RDNS_KEY,
  saveLastWalletRdns,
  readLastWalletRdns,
  clearLastWalletRdns,
} from '../src/wallet/wallet-context.js';
import {
  resetEip6963DiscoveryForTests,
  startEip6963Discovery,
  type Eip6963ProviderInfo,
} from '../src/wallet/eip6963-discovery.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_ADDRESS_A = '0x' + '1'.repeat(40);
const VALID_ADDRESS_B = '0x' + '2'.repeat(40);
const INVALID_ADDRESS_SHORT = '0x123';
const INVALID_ADDRESS_CHARS = '0x' + 'z'.repeat(40);
const INVALID_ADDRESS_NO_PREFIX = '1'.repeat(40);

const OKX_INFO: Eip6963ProviderInfo = {
  uuid: 'okx-uuid-polish',
  name: 'OKX Wallet',
  icon: 'data:image/svg+xml;utf8,<svg></svg>',
  rdns: 'com.okex.wallet',
};

const COINBASE_INFO: Eip6963ProviderInfo = {
  uuid: 'coinbase-uuid-polish',
  name: 'Coinbase Wallet',
  icon: 'data:image/svg+xml;utf8,<svg></svg>',
  rdns: 'com.coinbase.wallet',
};

function createMockProvider(overrides?: {
  accounts?: string[];
  chainId?: string;
  onRequest?: (args: { method: string; params?: unknown[] }) => unknown;
}) {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const requests: Array<{ method: string; params?: unknown[] }> = [];

  const provider = {
    requests,
    handlers,
    request: vi.fn(async (args: { method: string; params?: unknown[] }) => {
      requests.push(args);
      if (overrides?.onRequest) {
        const custom = overrides.onRequest(args);
        if (custom !== undefined) return custom;
      }
      if (args.method === 'eth_requestAccounts') return overrides?.accounts ?? [VALID_ADDRESS_A];
      if (args.method === 'eth_accounts') return overrides?.accounts ?? [VALID_ADDRESS_A];
      if (args.method === 'eth_chainId') return overrides?.chainId ?? '0xb626'; // Robinhood testnet 46630
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
      for (const handler of [...(handlers.get(event) ?? [])]) {
        handler(...args);
      }
    },
  };

  return provider;
}

describe('Wallet Polish (Issue #32)', () => {
  describe('W4: LocalStorage RDNS Persistence and Safety', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('saves, reads, and clears last wallet RDNS key', () => {
      expect(readLastWalletRdns()).toBeNull();

      saveLastWalletRdns('com.okex.wallet');
      expect(readLastWalletRdns()).toBe('com.okex.wallet');
      expect(localStorage.getItem(LAST_WALLET_RDNS_KEY)).toBe('com.okex.wallet');

      clearLastWalletRdns();
      expect(readLastWalletRdns()).toBeNull();
      expect(localStorage.getItem(LAST_WALLET_RDNS_KEY)).toBeNull();
    });

    it('handles localStorage errors gracefully without throwing', () => {
      const setSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const getSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const removeSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(() => saveLastWalletRdns('com.okex.wallet')).not.toThrow();
      expect(() => readLastWalletRdns()).not.toThrow();
      expect(readLastWalletRdns()).toBeNull();
      expect(() => clearLastWalletRdns()).not.toThrow();

      setSpy.mockRestore();
      getSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('W4: InjectedWalletAdapter.reconnect() Isolation', () => {
    it('calls only eth_accounts, never eth_requestAccounts during reconnect', async () => {
      const provider = createMockProvider({ accounts: [VALID_ADDRESS_A], chainId: '0xb626' });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      expect(adapter.getState()).toBe('DISCONNECTED');
      const account = await adapter.reconnect();

      expect(account).not.toBeNull();
      expect(account?.address).toBe(VALID_ADDRESS_A);
      expect(account?.chainId).toBe(46630);
      expect(adapter.getState()).toBe('CONNECTED');

      // Verify ONLY eth_accounts was requested
      const methods = provider.requests.map((r) => r.method);
      expect(methods).toContain('eth_accounts');
      expect(methods).toContain('eth_chainId');
      expect(methods).not.toContain('eth_requestAccounts');
    });

    it('returns null and stays DISCONNECTED when eth_accounts returns empty array', async () => {
      const provider = createMockProvider({ accounts: [] });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      const account = await adapter.reconnect();
      expect(account).toBeNull();
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('returns null and stays DISCONNECTED when eth_accounts returns malformed address', async () => {
      const provider = createMockProvider({ accounts: [INVALID_ADDRESS_SHORT] });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      const account = await adapter.reconnect();
      expect(account).toBeNull();
      expect(adapter.getState()).toBe('DISCONNECTED');
    });

    it('aborts reconnect cleanly if session was invalidated concurrently', async () => {
      const provider = createMockProvider();
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      const reconnectPromise = adapter.reconnect();
      await adapter.disconnect(); // Bump connect generation

      const account = await reconnectPromise;
      expect(account).toBeNull();
      expect(adapter.getState()).toBe('DISCONNECTED');
    });
  });

  describe('W5: Wallet-Specific Error Messages', () => {
    it('cites wallet name when user rejects connection (error 4001)', async () => {
      const provider = createMockProvider({
        onRequest: ({ method }) => {
          if (method === 'eth_requestAccounts') {
            const err = new Error('User rejected the request');
            (err as unknown as { code: number }).code = 4001;
            throw err;
          }
        },
      });

      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);
      await expect(adapter.connect()).rejects.toThrow('Connection request was rejected in OKX Wallet');

      const coinbaseAdapter = new InjectedWalletAdapter(provider, COINBASE_INFO);
      await expect(coinbaseAdapter.connect()).rejects.toThrow('Connection request was rejected in Coinbase Wallet');
    });

    it('falls back to neutral text when wallet name is not provided on error 4001', async () => {
      const provider = createMockProvider({
        onRequest: ({ method }) => {
          if (method === 'eth_requestAccounts') {
            const err = new Error('User rejected');
            (err as unknown as { code: number }).code = 4001;
            throw err;
          }
        },
      });

      // Pass null info (e.g. legacy injected provider)
      const adapter = new InjectedWalletAdapter(provider, null);
      await expect(adapter.connect()).rejects.toThrow('Connection request was rejected by user');
    });

    it('cites wallet name when connection request is already pending (error -32002)', async () => {
      const provider = createMockProvider({
        onRequest: ({ method }) => {
          if (method === 'eth_requestAccounts') {
            const err = new Error('Already pending');
            (err as unknown as { code: number }).code = -32002;
            throw err;
          }
        },
      });

      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);
      await expect(adapter.connect()).rejects.toThrow(
        'Connection request already pending in wallet extension. Please open OKX Wallet to approve.'
      );

      const legacyAdapter = new InjectedWalletAdapter(provider, null);
      await expect(legacyAdapter.connect()).rejects.toThrow(
        'Connection request already pending in wallet extension. Please open your wallet to approve.'
      );
    });

    it('never mentions MetaMask when connecting another wallet extension', async () => {
      const provider = createMockProvider({
        onRequest: ({ method }) => {
          if (method === 'eth_requestAccounts') {
            const err = new Error('Already pending');
            (err as unknown as { code: number }).code = -32002;
            throw err;
          }
        },
      });

      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);
      try {
        await adapter.connect();
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as Error).message).not.toContain('MetaMask');
        expect((err as Error).message).toContain('OKX Wallet');
      }
    });
  });

  describe('W6: Address and ChainId Validation', () => {
    it('rejects short address from eth_requestAccounts and stays DISCONNECTED', async () => {
      const provider = createMockProvider({ accounts: [INVALID_ADDRESS_SHORT] });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await expect(adapter.connect()).rejects.toThrow('Invalid address format returned by wallet');
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('rejects invalid hex characters in address from eth_requestAccounts', async () => {
      const provider = createMockProvider({ accounts: [INVALID_ADDRESS_CHARS] });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await expect(adapter.connect()).rejects.toThrow('Invalid address format returned by wallet');
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('rejects address missing 0x prefix from eth_requestAccounts', async () => {
      const provider = createMockProvider({ accounts: [INVALID_ADDRESS_NO_PREFIX] });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await expect(adapter.connect()).rejects.toThrow('Invalid address format returned by wallet');
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('disconnects safely when accountsChanged event receives invalid address format', async () => {
      const provider = createMockProvider({ accounts: [VALID_ADDRESS_A] });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await adapter.connect();
      expect(adapter.getState()).toBe('CONNECTED');

      // Provider emits invalid address
      provider.emit('accountsChanged', [INVALID_ADDRESS_CHARS]);
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('marks state UNSUPPORTED_NETWORK when chainId returned is malformed hex', async () => {
      const provider = createMockProvider({
        accounts: [VALID_ADDRESS_A],
        chainId: 'invalid_hex',
      });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await adapter.connect();
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');
    });

    it('marks state UNSUPPORTED_NETWORK when chainId is 0 or negative', async () => {
      const provider = createMockProvider({
        accounts: [VALID_ADDRESS_A],
        chainId: '0x0',
      });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await adapter.connect();
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');
    });

    it('transitions to UNSUPPORTED_NETWORK when chainChanged emits invalid hex', async () => {
      const provider = createMockProvider({
        accounts: [VALID_ADDRESS_A],
        chainId: '0xb626',
      });
      const adapter = new InjectedWalletAdapter(provider, OKX_INFO);

      await adapter.connect();
      expect(adapter.getState()).toBe('CONNECTED');

      provider.emit('chainChanged', 'not-a-valid-hex');
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');
    });
  });

  describe('W4 & W9: Full UI Integration (Auto-Reconnect & Cleaner Picker Modal)', () => {
    let root: Root | null = null;
    let container: HTMLDivElement | null = null;

    beforeEach(() => {
      localStorage.clear();
      resetEip6963DiscoveryForTests();
      delete (window as unknown as { ethereum?: unknown }).ethereum;
      document.body.innerHTML = '';
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      startEip6963Discovery();
    });

    afterEach(() => {
      act(() => root?.unmount());
      container?.remove();
      root = null;
      container = null;
      resetEip6963DiscoveryForTests();
      delete (window as unknown as { ethereum?: unknown }).ethereum;
      localStorage.clear();
    });

    it('W4: auto-reconnects without popup when matching provider announces and RDNS is stored', async () => {
      // Pre-save OKX RDNS
      saveLastWalletRdns(OKX_INFO.rdns);

      const okxProvider = createMockProvider({ accounts: [VALID_ADDRESS_B], chainId: '0xb626' });

      // Mount App
      act(() => {
        root?.render(<App />);
      });

      // Announce OKX provider
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
        await new Promise((r) => setTimeout(r, 10));
      });

      // Check that UI automatically connected
      expect(container?.textContent).toContain('OKX Wallet');
      expect(container?.textContent).toContain('0x2222...2222');

      // Verify eth_accounts was called, NOT eth_requestAccounts
      const methods = okxProvider.requests.map((r) => r.method);
      expect(methods).toContain('eth_accounts');
      expect(methods).not.toContain('eth_requestAccounts');

      // Disconnect clears stored RDNS
      const disconnectBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.trim() === 'Disconnect'
      );
      expect(disconnectBtn).toBeTruthy();

      await act(async () => {
        disconnectBtn?.click();
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(readLastWalletRdns()).toBeNull();
      expect(container?.textContent).toContain('Connect Wallet');
    });

    it('W9: renders cleaner picker with "Detected" badge and simplified subtitle', async () => {
      const okxProvider = createMockProvider();

      act(() => {
        root?.render(<App />);
      });

      // Announce provider
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
      });

      // Click Connect Wallet button to open modal
      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      expect(connectBtn).toBeTruthy();

      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      expect(modal).toBeTruthy();

      // Subtitle check
      expect(modal?.textContent).toContain('Choose a wallet to connect to Robex.');

      // Provider entry shows name and "Detected" badge
      const okxButton = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('OKX Wallet')
      );
      expect(okxButton).toBeTruthy();
      expect(okxButton?.textContent).toContain('Detected');
    });

    it('QA-02(a): OKX eth_accounts pending while user connects Coinbase manually; OKX resolves and Coinbase remains active and stored', async () => {
      saveLastWalletRdns(OKX_INFO.rdns);

      let resolveOkxAccounts: (value: string[]) => void = () => {};
      const okxAccountsPromise = new Promise<string[]>((resolve) => {
        resolveOkxAccounts = resolve;
      });

      const okxProvider = createMockProvider({
        onRequest: ({ method }) => {
          if (method === 'eth_accounts') return okxAccountsPromise;
        },
      });

      const coinbaseProvider = createMockProvider({
        accounts: [VALID_ADDRESS_A],
        chainId: '0xb626',
      });

      act(() => {
        root?.render(<App />);
      });

      // Announce OKX and Coinbase providers
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: COINBASE_INFO, provider: coinbaseProvider }),
          })
        );
        await new Promise((r) => setTimeout(r, 10));
      });

      // OKX eth_accounts is now in flight
      expect(okxProvider.requests.some((r) => r.method === 'eth_accounts')).toBe(true);

      // User opens modal and connects Coinbase manually
      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      expect(connectBtn).toBeTruthy();
      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      const coinbaseBtn = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Coinbase Wallet')
      );
      expect(coinbaseBtn).toBeTruthy();
      await act(async () => {
        coinbaseBtn?.click();
      });

      // Coinbase is now connected
      expect(container?.textContent).toContain('Coinbase Wallet');
      expect(container?.textContent).toContain('0x1111...1111');
      expect(readLastWalletRdns()).toBe(COINBASE_INFO.rdns);

      // Now OKX eth_accounts finally resolves late
      await act(async () => {
        resolveOkxAccounts([VALID_ADDRESS_B]);
        await new Promise((r) => setTimeout(r, 20));
      });

      // Coinbase MUST remain active and stored, not overwritten by stale OKX!
      expect(container?.textContent).toContain('Coinbase Wallet');
      expect(container?.textContent).not.toContain('OKX Wallet');
      expect(container?.textContent).toContain('0x1111...1111');
      expect(readLastWalletRdns()).toBe(COINBASE_INFO.rdns);
    });

    it('QA-02(b): OKX eth_accounts pending while user connects Mock Wallet; OKX resolves and Mock remains active', async () => {
      saveLastWalletRdns(OKX_INFO.rdns);

      let resolveOkxAccounts: (value: string[]) => void = () => {};
      const okxAccountsPromise = new Promise<string[]>((resolve) => {
        resolveOkxAccounts = resolve;
      });

      const okxProvider = createMockProvider({
        onRequest: ({ method }) => {
          if (method === 'eth_accounts') return okxAccountsPromise;
        },
      });

      (import.meta.env as Record<string, unknown>).VITE_ENABLE_MOCK_WALLET = 'true';

      act(() => {
        root?.render(<App />);
      });

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(okxProvider.requests.some((r) => r.method === 'eth_accounts')).toBe(true);

      // User opens modal and connects Mock Wallet
      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      expect(connectBtn).toBeTruthy();
      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      const mockBtn = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Dev Mock Wallet')
      );
      expect(mockBtn).toBeTruthy();
      await act(async () => {
        mockBtn?.click();
        await new Promise((r) => setTimeout(r, 150));
      });

      expect(container?.textContent).toContain('DEV MOCK');
      expect(readLastWalletRdns()).toBeNull();

      // OKX late resolution
      await act(async () => {
        resolveOkxAccounts([VALID_ADDRESS_B]);
        await new Promise((r) => setTimeout(r, 20));
      });

      // Mock wallet remains active
      expect(container?.textContent).toContain('DEV MOCK');
      expect(container?.textContent).not.toContain('OKX Wallet');
      expect(readLastWalletRdns()).toBeNull();
    });

    it('QA-02(c): after Disconnect and remount, no eth_accounts call is made', async () => {
      saveLastWalletRdns(OKX_INFO.rdns);
      const okxProvider = createMockProvider({ accounts: [VALID_ADDRESS_B], chainId: '0xb626' });

      act(() => {
        root?.render(<App />);
      });

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(container?.textContent).toContain('OKX Wallet');

      // Click Disconnect
      const disconnectBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.trim() === 'Disconnect'
      );
      expect(disconnectBtn).toBeTruthy();
      await act(async () => {
        disconnectBtn?.click();
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(readLastWalletRdns()).toBeNull();

      // Unmount and reset discovery
      act(() => {
        root?.unmount();
      });
      document.body.innerHTML = '';
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      resetEip6963DiscoveryForTests();
      startEip6963Discovery();

      const newOkxProvider = createMockProvider({ accounts: [VALID_ADDRESS_B], chainId: '0xb626' });

      // Remount
      act(() => {
        root?.render(<App />);
      });

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: newOkxProvider }),
          })
        );
        await new Promise((r) => setTimeout(r, 10));
      });

      // Verify no eth_accounts call was made on new mount!
      expect(newOkxProvider.requests.filter((r) => r.method === 'eth_accounts')).toHaveLength(0);
      expect(container?.textContent).toContain('Connect Wallet');
    });

    it('QA-02(d): manual connect saves rdns to localStorage', async () => {
      expect(readLastWalletRdns()).toBeNull();
      const okxProvider = createMockProvider({ accounts: [VALID_ADDRESS_A], chainId: '0xb626' });

      act(() => {
        root?.render(<App />);
      });

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
      });

      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      const okxBtn = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('OKX Wallet')
      );
      expect(okxBtn).toBeTruthy();
      await act(async () => {
        okxBtn?.click();
      });

      expect(container?.textContent).toContain('OKX Wallet');
      expect(readLastWalletRdns()).toBe(OKX_INFO.rdns);
    });

    it('QA-02(e): app operates gracefully when localStorage throws SecurityError', async () => {
      const setSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const getSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const removeSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const okxProvider = createMockProvider({ accounts: [VALID_ADDRESS_A], chainId: '0xb626' });

      act(() => {
        root?.render(<App />);
      });

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: OKX_INFO, provider: okxProvider }),
          })
        );
      });

      // Manual connect does not crash
      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      const okxBtn = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('OKX Wallet')
      );
      await act(async () => {
        okxBtn?.click();
      });

      expect(container?.textContent).toContain('OKX Wallet');

      // Disconnect does not crash
      const disconnectBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.trim() === 'Disconnect'
      );
      expect(disconnectBtn).toBeTruthy();
      await act(async () => {
        disconnectBtn?.click();
      });
      expect(container?.textContent).toContain('Connect Wallet');

      setSpy.mockRestore();
      getSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('QA-03 & QA-04: shows install hint and Not Detected for legacy when no wallet is announced', async () => {
      act(() => {
        root?.render(<App />);
      });

      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      expect(connectBtn).toBeTruthy();
      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      expect(modal).toBeTruthy();

      // QA-04: Plain hint line when no wallet is announced
      expect(modal?.textContent).toContain('No wallet extension detected. Please install a browser wallet to connect to Robex.');

      // QA-03: When no window.ethereum exists, Browser Wallet badge is "Not Detected"
      const legacyBtn = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Browser Wallet')
      );
      expect(legacyBtn).toBeTruthy();
      expect(legacyBtn?.textContent).toContain('Not Detected');
      expect(legacyBtn?.textContent).not.toContain('Detected\n');
    });

    it('QA-03: shows Detected badge for legacy Browser Wallet when window.ethereum is available', async () => {
      (window as unknown as { ethereum: unknown }).ethereum = createMockProvider();

      act(() => {
        root?.render(<App />);
      });

      const connectBtn = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Connect Wallet')
      );
      expect(connectBtn).toBeTruthy();
      await act(async () => {
        connectBtn?.click();
      });

      const modal = container?.querySelector('.modal-content');
      expect(modal).toBeTruthy();

      // QA-03: When window.ethereum exists, Browser Wallet badge is "Detected"
      const legacyBtn = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Browser Wallet')
      );
      expect(legacyBtn).toBeTruthy();
      expect(legacyBtn?.textContent).toContain('Detected');
      expect(legacyBtn?.textContent).not.toContain('Not Detected');
    });
  });
});
