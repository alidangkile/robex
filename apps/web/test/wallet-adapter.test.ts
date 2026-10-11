import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { InjectedWalletAdapter, StaleConnectSessionError } from '../src/wallet/injected-wallet-adapter.js';
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

    it('enforces mock wallet gating: requires both development runtime and explicit flag=true', () => {
      // Development runtime (isDev = true)
      expect(isMockWalletAllowed(true, 'true')).toBe(true);
      expect(isMockWalletAllowed(true, 'false')).toBe(false);
      expect(isMockWalletAllowed(true, undefined)).toBe(false);

      // Production runtime (isDev = false)
      expect(isMockWalletAllowed(false, 'true')).toBe(false);
      expect(isMockWalletAllowed(false, 'false')).toBe(false);
      expect(isMockWalletAllowed(false, undefined)).toBe(false);
    });

    it('connects to active testnet from centralized network config', async () => {
      const adapter = new MockWalletAdapter();
      const account = await adapter.connect();

      expect(adapter.getState()).toBe('CONNECTED');
      expect(account.chainId).toBe(activeNetwork.chainId);
      expect(account.address).toBeDefined();
    });

    it('transitions to WRONG_NETWORK for known Robex network (Robinhood Mainnet 4663)', async () => {
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

    it('connects on Robinhood Mainnet (4663) -> WRONG_NETWORK', async () => {
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x9999999999999999999999999999999999999999'];
        if (method === 'eth_chainId') return '0x1237'; // 4663 in hex
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
      chainHandler('0x1237');
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

    it('MEDIUM 3: falls back to wallet_addEthereumChain on 4902 and completes explicit secondary switch', async () => {
      const calls: string[] = [];
      mockProvider.request.mockImplementation(async ({ method }) => {
        calls.push(method);
        if (method === 'wallet_switchEthereumChain' && calls.filter((m) => m === 'wallet_switchEthereumChain').length === 1) {
          const err = new Error('Unrecognized chain ID') as Error & { code: number };
          err.code = 4902;
          throw err;
        }
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.switchChain(46630);

      // Verify sequence: initial switch -> add chain -> explicit secondary switch
      expect(calls).toEqual([
        'wallet_switchEthereumChain',
        'wallet_addEthereumChain',
        'wallet_switchEthereumChain',
      ]);
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

    it('MEDIUM 3: handles user rejection on the secondary switch following network addition', async () => {
      let switchCalls = 0;
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') {
          switchCalls++;
          if (switchCalls === 1) {
            const err = new Error('Unrecognized chain ID') as Error & { code: number };
            err.code = 4902;
            throw err;
          }
          throw { code: 4001, message: 'User rejected secondary switch' };
        }
        if (method === 'wallet_addEthereumChain') return null;
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await expect(adapter.switchChain(46630)).rejects.toThrow('Network switch was rejected by user');
    });

    it('MEDIUM 6: restricts switchChain to active testnet and blocks mainnet/unsupported targets before provider call', async () => {
      const adapter = new InjectedWalletAdapter();

      // Attempt to switch to Robinhood Mainnet (4663) -> Rejected before provider call
      await expect(adapter.switchChain(4663)).rejects.toThrow(
        'Safety Invariant: Plan 002 strictly restricts network switching to active Robinhood Chain Testnet'
      );
      expect(mockProvider.request).toHaveBeenCalledTimes(0);

      // Attempt to switch to Ethereum Mainnet (1) -> Rejected before provider call
      await expect(adapter.switchChain(1)).rejects.toThrow(
        'Safety Invariant: Plan 002 strictly restricts network switching to active Robinhood Chain Testnet'
      );
      expect(mockProvider.request).toHaveBeenCalledTimes(0);
    });

    it('throws user-friendly error when network switch is rejected by user', async () => {
      mockProvider.request.mockRejectedValue({ code: 4001, message: 'User rejected switch' });

      const adapter = new InjectedWalletAdapter();
      await expect(adapter.switchChain(46630)).rejects.toThrow('Network switch was rejected by user');
    });

    it('HIGH 2: deduplicates in-flight connection requests and prevents concurrent eth_requestAccounts', async () => {
      let resolveAccounts: (accounts: string[]) => void = () => {};
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') {
          return new Promise<string[]>((res) => {
            resolveAccounts = res;
          });
        }
        if (method === 'eth_chainId') return '0xb626';
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      const promise1 = adapter.connect();
      const promise2 = adapter.connect();

      expect(adapter.getState()).toBe('CONNECTING');

      // Resolve the single in-flight request
      resolveAccounts(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']);
      const [account1, account2] = await Promise.all([promise1, promise2]);

      expect(account1.address).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(account2.address).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(mockProvider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
      const requestAccountsCalls = mockProvider.request.mock.calls.filter(
        (call) => (call[0] as { method: string }).method === 'eth_requestAccounts'
      );
      expect(requestAccountsCalls).toHaveLength(1);
    });

    it('HIGH 1 Regression: account cleared -> chain event (state stays DISCONNECTED, account stays null)', async () => {
      let accountsHandler: (accounts: string[]) => void = () => {};
      let chainHandler: (chainIdHex: string) => void = () => {};
      mockProvider.on.mockImplementation((event, handler) => {
        if (event === 'accountsChanged') accountsHandler = handler;
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

      // User locks wallet: accountsChanged([])
      accountsHandler([]);
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();

      // Later, wallet fires chainChanged event while still locked
      chainHandler('0xb626');
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('HIGH 1 Regression: account cleared -> account returns (uses validated chainId correctly)', async () => {
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
      expect(adapter.getState()).toBe('CONNECTED');

      // Lock wallet
      accountsHandler([]);
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();

      // Unlock wallet with account
      accountsHandler(['0x3333333333333333333333333333333333333333']);
      expect(adapter.getState()).toBe('CONNECTED');
      expect(adapter.getAccount()?.address).toBe('0x3333333333333333333333333333333333333333');
      expect(adapter.getAccount()?.chainId).toBe(46630);
    });

    it('HIGH 1 Regression: chain event before account event correctly determines state upon account arrival', async () => {
      let accountsHandler: (accounts: string[]) => void = () => {};
      let chainHandler: (chainIdHex: string) => void = () => {};
      mockProvider.on.mockImplementation((event, handler) => {
        if (event === 'accountsChanged') accountsHandler = handler;
        if (event === 'chainChanged') chainHandler = handler;
      });
      mockProvider.request.mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0xb626';
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.connect();

      // Lock wallet
      accountsHandler([]);
      expect(adapter.getState()).toBe('DISCONNECTED');

      // Chain changed to Robinhood Mainnet (4663) while locked
      chainHandler('0x1237');
      expect(adapter.getState()).toBe('DISCONNECTED'); // remains disconnected while account is null

      // Account unlocks
      accountsHandler(['0x4444444444444444444444444444444444444444']);
      expect(adapter.getState()).toBe('WRONG_NETWORK');
      expect(adapter.getAccount()?.chainId).toBe(4663);
      expect(adapter.getAccount()?.address).toBe('0x4444444444444444444444444444444444444444');
    });

    it('HIGH 1 Regression: disconnect -> later chain event leaves state DISCONNECTED', async () => {
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
      await adapter.disconnect();

      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();

      // Provider emits chainChanged after disconnect
      chainHandler('0xb626');
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
    });

    it('disposes adapter listeners cleanly', async () => {
      const adapter = new InjectedWalletAdapter();
      adapter.dispose();
      expect(adapter.getState()).toBe('DISCONNECTED');
    });

    it('R1: pending connect discarded after provider disconnect does not restore identity, emit CONNECTED, or install listeners', async () => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      let releaseAccounts: (accounts: string[]) => void = () => {};
      let accountPhase: 'initial' | 'hold' | 'fresh' = 'initial';
      const initialAccount = '0x1111111111111111111111111111111111111111';
      const freshAccount = '0x2222222222222222222222222222222222222222';

      mockProvider.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      });
      mockProvider.removeListener.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      });
      mockProvider.request.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts') {
          if (accountPhase === 'initial') return [initialAccount];
          if (accountPhase === 'hold') {
            return new Promise<string[]>((resolve) => {
              releaseAccounts = resolve;
            });
          }
          return [freshAccount];
        }
        if (method === 'eth_chainId') return '0xb626';
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      await adapter.connect();
      expect(adapter.getState()).toBe('CONNECTED');

      handlers.get('chainChanged')?.('0x1');
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');

      const seen: string[] = [];
      adapter.onStateChange((next) => seen.push(next));
      accountPhase = 'hold';
      const pending = adapter.connect();
      expect(adapter.getState()).toBe('CONNECTING');

      let settled = false;
      pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      await Promise.resolve();
      expect(settled).toBe(false);

      const onCallsAfterConnectAttempt = mockProvider.on.mock.calls.length;
      handlers.get('disconnect')?.({ code: 4900 });
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
      expect(settled).toBe(false);

      releaseAccounts([initialAccount]);
      let rejection: unknown;
      await pending.catch((err: unknown) => {
        rejection = err;
      });
      expect(rejection).toBeInstanceOf(StaleConnectSessionError);

      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
      expect(seen).not.toContain('CONNECTED');
      expect(mockProvider.on.mock.calls.length).toBe(onCallsAfterConnectAttempt);

      accountPhase = 'fresh';
      const reconnected = await adapter.connect();
      expect(reconnected.address).toBe(freshAccount);
      expect(adapter.getState()).toBe('CONNECTED');
      expect(adapter.getAccount()?.chainId).toBe(46630);
      expect(mockProvider.on.mock.calls.length).toBeGreaterThan(onCallsAfterConnectAttempt);
    });

    it('R1: pending connect discarded after adapter dispose does not install identity and a later reconnect works', async () => {
      let releaseAccounts: (accounts: string[]) => void = () => {};
      let accountPhase: 'hold' | 'fresh' = 'hold';
      const staleAccount = '0x3333333333333333333333333333333333333333';
      const freshAccount = '0x4444444444444444444444444444444444444444';

      mockProvider.request.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts') {
          if (accountPhase === 'hold') {
            return new Promise<string[]>((resolve) => {
              releaseAccounts = resolve;
            });
          }
          return [freshAccount];
        }
        if (method === 'eth_chainId') return '0xb626';
        return null;
      });

      const adapter = new InjectedWalletAdapter();
      const pending = adapter.connect();
      expect(adapter.getState()).toBe('CONNECTING');

      let settled = false;
      pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(mockProvider.on).not.toHaveBeenCalled();

      adapter.dispose();
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();

      const seen: string[] = [];
      adapter.onStateChange((next) => seen.push(next));
      releaseAccounts([staleAccount]);
      let rejection: unknown;
      await pending.catch((err: unknown) => {
        rejection = err;
      });
      expect(rejection).toBeInstanceOf(StaleConnectSessionError);

      expect(settled).toBe(true);
      expect(adapter.getState()).toBe('DISCONNECTED');
      expect(adapter.getAccount()).toBeNull();
      expect(seen).not.toContain('CONNECTED');
      expect(mockProvider.on).not.toHaveBeenCalled();

      accountPhase = 'fresh';
      const reconnected = await adapter.connect();
      expect(reconnected.address).toBe(freshAccount);
      expect(adapter.getState()).toBe('CONNECTED');
      expect(mockProvider.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
      expect(mockProvider.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('enforces safety invariant: InjectedWalletAdapter blocks transaction execution', async () => {
      const adapter = new InjectedWalletAdapter();
      await expect(
        adapter.sendTransaction({ to: '0x0000000000000000000000000000000000000001' })
      ).rejects.toThrow('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
    });
  });

  describe('EIP-6963 selected provider isolation', () => {
    function trackedProvider(address: string) {
      const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
      const requests: string[] = [];
      const provider = {
        isMetaMask: true as boolean | undefined,
        isOkxWallet: undefined as boolean | undefined,
        request: vi.fn(async ({ method }: { method: string }) => {
          requests.push(method);
          if (method === 'eth_requestAccounts') return [address];
          if (method === 'eth_chainId') return '0xb626';
          return null;
        }),
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          const set = handlers.get(event) ?? new Set<(...args: unknown[]) => void>();
          set.add(handler);
          handlers.set(event, set);
        }),
        removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          handlers.get(event)?.delete(handler);
        }),
        emit(event: string, ...args: unknown[]) {
          for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
        },
      };
      return { provider, handlers, requests };
    }

    const okxInfo = {
      uuid: 'okx-uuid',
      name: 'OKX Wallet',
      icon: '',
      rdns: 'com.okex.wallet',
    };
    const metamaskInfo = {
      uuid: 'mm-uuid',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
    };

    it('T2/T3/T4: selected OKX receives RPC and events; MetaMask window.ethereum does not', async () => {
      const metamask = trackedProvider('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      const okx = trackedProvider('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      okx.provider.isMetaMask = true;
      okx.provider.isOkxWallet = true;
      (globalThis as unknown as { window: { ethereum?: unknown } }).window.ethereum = metamask.provider;

      const adapter = new InjectedWalletAdapter(okx.provider, okxInfo);
      expect(adapter.name).toBe('OKX Wallet');
      expect(adapter.type).toBe('INJECTED');

      await adapter.connect();
      expect(okx.requests).toEqual(['eth_requestAccounts', 'eth_chainId']);
      expect(metamask.requests).toEqual([]);
      expect(metamask.provider.on).not.toHaveBeenCalled();
      expect(adapter.getState()).toBe('CONNECTED');

      metamask.provider.emit('chainChanged', '0x1');
      metamask.provider.emit('accountsChanged', ['0xcccccccccccccccccccccccccccccccccccccccc']);
      expect(adapter.getState()).toBe('CONNECTED');
      expect(adapter.getAccount()?.address).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      okx.provider.emit('chainChanged', '0x1');
      expect(adapter.getState()).toBe('UNSUPPORTED_NETWORK');
      expect(adapter.getAccount()?.address).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      okx.provider.emit('accountsChanged', ['0xdddddddddddddddddddddddddddddddddddddddd']);
      expect(adapter.getAccount()?.address).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
      expect(metamask.requests).toEqual([]);

      await adapter.switchChain(4663).catch(() => undefined);
      expect(metamask.requests).toEqual([]);
      expect(okx.requests.filter((method) => method === 'wallet_switchEthereumChain')).toEqual([]);
      await adapter.switchChain(46630);
      expect(okx.requests).toContain('wallet_switchEthereumChain');
      expect(metamask.requests).toEqual([]);
    });

    it('T5/T6: disconnect drops the selected provider and a different wallet can be bound cleanly', async () => {
      const metamask = trackedProvider('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      const okx = trackedProvider('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      const metamaskAdapter = new InjectedWalletAdapter(metamask.provider, metamaskInfo);
      await metamaskAdapter.connect();
      expect(metamask.handlers.get('accountsChanged')?.size).toBe(1);

      await metamaskAdapter.disconnect();
      expect(metamask.handlers.get('accountsChanged')?.size ?? 0).toBe(0);
      expect(metamaskAdapter.getState()).toBe('DISCONNECTED');

      metamask.provider.emit('accountsChanged', ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
      metamask.provider.emit('chainChanged', '0xb626');
      expect(metamaskAdapter.getAccount()).toBeNull();
      expect(metamaskAdapter.getState()).toBe('DISCONNECTED');

      metamaskAdapter.dispose();
      const okxAdapter = new InjectedWalletAdapter(okx.provider, okxInfo);
      await okxAdapter.connect();
      expect(okxAdapter.name).toBe('OKX Wallet');
      expect(okxAdapter.getAccount()?.address).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      expect(okx.handlers.get('chainChanged')?.size).toBe(1);
      expect(metamask.handlers.get('chainChanged')?.size ?? 0).toBe(0);
      expect(metamask.requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
      expect(okx.requests.filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
    });
  });
});
