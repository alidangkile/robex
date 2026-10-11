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
  });
});
