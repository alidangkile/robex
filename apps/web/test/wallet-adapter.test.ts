import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { InjectedWalletAdapter } from '../src/wallet/injected-wallet-adapter.js';
import { isMockWalletAllowed } from '../src/wallet/wallet-context.js';
import { getActiveNetworkConfig, ROBINHOOD_MAINNET_CONFIG } from '@robex/config';
import type { InvalidationReason } from '@robex/types';

describe('Plan 002 Wallet & Network State', () => {
  const activeNetwork = getActiveNetworkConfig();

  describe('MockWalletAdapter (Development Isolation & Gating)', () => {
    it('initializes in DISCONNECTED state with isMock true', () => {
      const adapter = new MockWalletAdapter();
      expect(adapter.isMock).toBe(true);
      expect(adapter.type).toBe('MOCK');
      expect(adapter.hasProvider()).toBe(true);
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('enforces mock wallet gating: strictly disabled in production regardless of flag', () => {
      // In production (isDev = false): ALWAYS disabled regardless of flag
      expect(isMockWalletAllowed(false, 'true')).toBe(false);
      expect(isMockWalletAllowed(false, 'false')).toBe(false);
      expect(isMockWalletAllowed(false, undefined)).toBe(false);

      // In development (isDev = true): enabled unless explicitly disabled
      expect(isMockWalletAllowed(true, 'true')).toBe(true);
      expect(isMockWalletAllowed(true, undefined)).toBe(true);
      expect(isMockWalletAllowed(true, 'false')).toBe(false);
    });

    it('connects to active testnet from centralized network config', async () => {
      const adapter = new MockWalletAdapter();
      const account = await adapter.connect();

      expect(adapter.getState()).toBe('CONNECTED');
      expect(account.chainId).toBe(activeNetwork.chainId);
      expect(account.address).toBeDefined();
    });

    it('transitions to WRONG_NETWORK for known Robex network (Robinhood Mainnet 46600)', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      await adapter.switchChain(ROBINHOOD_MAINNET_CONFIG.chainId);
      expect(adapter.getState()).toBe('WRONG_NETWORK');
    });

    it('transitions to UNSUPPORTED_NETWORK for unknown chain (e.g. Ethereum Mainnet 1)', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      await adapter.switchChain(1);
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');

      // Recover to active testnet
      await adapter.switchChain(activeNetwork.chainId);
      expect(adapter.getState()).toBe('CONNECTED');
    });

    it('emits state invalidation on account change and chain change', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const invalidationReasons: InvalidationReason[] = [];
      const unsub = adapter.onInvalidation((reason) => {
        invalidationReasons.push(reason);
      });

      adapter.simulateAccountChange('0x1111111111111111111111111111111111111111');
      expect(adapter.getAccount()?.address).toBe('0x1111111111111111111111111111111111111111');
      expect(invalidationReasons).toContain('account');

      await adapter.switchChain(1);
      expect(invalidationReasons).toContain('chain');

      await adapter.disconnect();
      expect(invalidationReasons).toContain('disconnect');

      unsub();
    });

    it('enforces safety invariant: MockWalletAdapter blocks transaction execution', async () => {
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      await expect(
        adapter.sendTransaction({ to: '0x0000000000000000000000000000000000000001' })
      ).rejects.toThrow('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
    });
  });

  describe('InjectedWalletAdapter (Simulated EIP-1193 Provider Integration & Logic Tests)', () => {
    let mockProvider: {
      request: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
      isMetaMask?: boolean;
      isRabby?: boolean;
    };

    beforeEach(() => {
      mockProvider = {
        request: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        isMetaMask: true,
      };
      (globalThis as unknown as { window: { ethereum?: unknown } }).window = {
        ethereum: mockProvider,
      };
    });

    afterEach(() => {
      delete (globalThis as unknown as { window: { ethereum?: unknown } }).window.ethereum;
    });

    it('identifies provider type accurately as METAMASK', () => {
      const adapter = new InjectedWalletAdapter();
      expect(adapter.isMock).toBe(false);
      expect(adapter.hasProvider()).toBe(true);
      expect(adapter.type).toBe('METAMASK');
      expect(adapter.name).toBe('MetaMask');
    });

    it('throws descriptive error if injected provider is missing', async () => {
      delete (globalThis as unknown as { window: { ethereum?: unknown } }).window.ethereum;
      const adapter = new InjectedWalletAdapter();
      expect(adapter.hasProvider()).toBe(false);

      await expect(adapter.connect()).rejects.toThrow(
        'No browser wallet extension detected (e.g. MetaMask, Rabby)'
      );
    });

    it('connects and detects active Robinhood Chain Testnet (46630) -> CONNECTED', async () => {
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x9999999999999999999999999999999999999999'];
        if (method === 'eth_chainId') return '0xb626'; // 46630 in hex
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      const account = await adapter.connect();

      expect(adapter.getState()).toBe('CONNECTED');
      expect(account.address).toBe('0x9999999999999999999999999999999999999999');
      expect(account.chainId).toBe(46630);
      expect(mockProvider.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
      expect(mockProvider.on).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    });

    it('connects on Robinhood Mainnet (46600) -> WRONG_NETWORK', async () => {
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x9999999999999999999999999999999999999999'];
        if (method === 'eth_chainId') return '0xb608'; // 46600 in hex
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.connect();

      expect(adapter.getState()).toBe('WRONG_NETWORK');
    });

    it('connects on unsupported network (1) -> UNSUPPORTED_NETWORK', async () => {
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x9999999999999999999999999999999999999999'];
        if (method === 'eth_chainId') return '0x1'; // 1 in hex
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.connect();

      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');
    });

    it('handles user rejection (error code 4001) safely without leaking stale state', async () => {
      mockProvider.request.mockRejectedValue({ code: 4001, message: 'User rejected the request.' });

      const adapter = new InjectedWalletAdapter();
      await expect(adapter.connect()).rejects.toThrow('Connection request was rejected by user');
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('handles already pending request (error code -32002) cleanly', async () => {
      mockProvider.request.mockRejectedValue({ code: -32002, message: 'Request already pending' });

      const adapter = new InjectedWalletAdapter();
      await expect(adapter.connect()).rejects.toThrow('Connection request already pending in wallet extension');
      expect(adapter.getState()).toBe('DISCONNECTED');
    });

    it('responds to accountsChanged event: switches account and invalidates state', async () => {
      let accountsHandler: (accounts: string[]) => void = () => {};
      mockProvider.on.mockImplementation((event, handler) => {
        if (event === 'accountsChanged') accountsHandler = handler;
      });
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0xb626';
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.connect();

      const invalidationReasons: InvalidationReason[] = [];
      adapter.onInvalidation((reason) => invalidationReasons.push(reason));

      // Simulate account change in wallet
      accountsHandler(['0x2222222222222222222222222222222222222222']);
      expect(adapter.getAccount()?.address).toBe('0x2222222222222222222222222222222222222222');
      expect(invalidationReasons).toContain('account');

      // Simulate wallet lock / empty accounts
      accountsHandler([]);
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
      expect(invalidationReasons).toContain('disconnect');
    });

    it('responds to chainChanged event: updates network state and invalidates cache', async () => {
      let chainHandler: (chainIdHex: string) => void = () => {};
      mockProvider.on.mockImplementation((event, handler) => {
        if (event === 'chainChanged') chainHandler = handler;
      });
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0xb626';
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.connect();
      expect(adapter.getState()).toBe('CONNECTED');

      const invalidationReasons: InvalidationReason[] = [];
      adapter.onInvalidation((reason) => invalidationReasons.push(reason));

      // Switch to Robinhood Mainnet -> WRONG_NETWORK
      chainHandler('0xb608');
      expect(adapter.getState()).toBe('WRONG_NETWORK');
      expect(invalidationReasons).toContain('chain');

      // Switch to Ethereum Mainnet -> UNSUPPORTED_NETWORK
      chainHandler('0x1');
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');

      // Switch back to Robinhood Testnet -> CONNECTED
      chainHandler('0xb626');
      expect(adapter.getState()).toBe('CONNECTED');
    });

    it('switches chain via wallet_switchEthereumChain', async () => {
      mockProvider.request.mockResolvedValue(null);

      const adapter = new InjectedWalletAdapter();
      await adapter.switchChain(46630);

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xb626' }],
      });
    });

    it('falls back to wallet_addEthereumChain when chain is missing (error 4902)', async () => {
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') {
          const err = new Error('Unrecognized chain ID') as Error & { code: number };
          err.code = 4902;
          throw err;
        }
        if (method === 'wallet_addEthereumChain') {
          return null;
        }
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.switchChain(46630);

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'wallet_addEthereumChain',
        params: [
          expect.objectContaining({
            chainId: '0xb626',
            chainName: activeNetwork.chainName,
            rpcUrls: [activeNetwork.providers.rpcUrl],
          }),
        ],
      });
    });

    it('throws user-friendly error when network switch is rejected by user', async () => {
      mockProvider.request.mockRejectedValue({ code: 4001, message: 'User rejected switch' });

      const adapter = new InjectedWalletAdapter();
      await expect(adapter.switchChain(46630)).rejects.toThrow('Network switch was rejected by user');
    });

    it('enforces safety invariant: InjectedWalletAdapter blocks transaction execution', async () => {
      const adapter = new InjectedWalletAdapter();
      await expect(
        adapter.sendTransaction({ to: '0x0000000000000000000000000000000000000001' })
      ).rejects.toThrow('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
    });
  });
});
