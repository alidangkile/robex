import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { InvalidationReason, NativeBalanceReading, WalletAccount, WalletAdapter, WalletState, WalletType } from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';
import {
  InjectedWalletAdapter,
  StaleConnectSessionError,
  getPendingSwapHash,
} from './injected-wallet-adapter.js';
export {
  getPendingSwapHash,
};
import {
  getDiscoveredProviders,
  readLegacyInjectedProvider,
  startEip6963Discovery,
  subscribeEip6963Providers,
  type DiscoveredEip6963Provider,
  type Eip1193Provider,
  type Eip6963ProviderInfo,
} from './eip6963-discovery.js';

/**
 * Storage key for persisting chosen EIP-6963 wallet rdns for session auto-reconnect (W4).
 * Only the rdns identifier is stored; no account addresses or sensitive data.
 */
export const LAST_WALLET_RDNS_KEY = 'robex_last_wallet_rdns';

export function saveLastWalletRdns(rdns: string): void {
  try {
    localStorage.setItem(LAST_WALLET_RDNS_KEY, rdns);
  } catch {
    // Ignore storage errors safely per W4
  }
}

export function readLastWalletRdns(): string | null {
  try {
    return localStorage.getItem(LAST_WALLET_RDNS_KEY);
  } catch {
    return null;
  }
}

export function clearLastWalletRdns(): void {
  try {
    localStorage.removeItem(LAST_WALLET_RDNS_KEY);
  } catch {
    // Ignore storage errors safely per W4
  }
}

/**
 * Read-only native balance of the connected account (Plan 003B Amendment 1
 * §6A, D8). Read through the wallet's own provider; never sent to the API.
 */
export type NativeBalanceState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'ok'; wei: bigint; isMock: boolean }
  | { status: 'error'; message: string };

interface WalletContextValue {
  adapter: WalletAdapter;
  state: WalletState;
  account: WalletAccount | null;
  walletName: string;
  walletType: WalletType;
  hasInjectedProvider: boolean;
  discoveredProviders: DiscoveredEip6963Provider[];
  legacyProviderAvailable: boolean;
  isMockWallet: boolean;
  isMockWalletEnabled: boolean;
  connect: () => Promise<void>;
  connectInjected: () => Promise<void>;
  connectDiscovered: (uuid: string) => Promise<void>;
  openWalletSelector: () => void;
  walletSelectorNonce: number;
  connectMock: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  switchToActiveNetwork: () => Promise<void>;
  walletError: string | null;
  clearWalletError: () => void;
  invalidationVersion: number;
  lastInvalidationReason: InvalidationReason | null;
  nativeBalance: NativeBalanceState;
  refreshNativeBalance: () => void;
  usdgBalance: NativeBalanceState;
  refreshUsdgBalance: () => void;
  refreshBalances: () => void;
  clearDroppedPendingSwap: (userConfirmed: boolean) => Promise<boolean>;
}

/**
 * Security Invariant: Mock wallet is strictly prohibited in production builds under all circumstances.
 * In development, mock wallet is ONLY available when explicitly enabled by flag:
 * VITE_ENABLE_MOCK_WALLET === 'true'.
 */
export function isMockWalletAllowed(isDev: boolean, enableMockFlag?: string): boolean {
  return isDev === true && enableMockFlag === 'true';
}

function readErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

/** How long a wallet native-balance read may hang before the UI shows an error. */
export const NATIVE_BALANCE_TIMEOUT_MS = 5000;

/**
 * Tests assign `.current` (then restore `NATIVE_BALANCE_TIMEOUT_MS`).
 * An imported ESM binding cannot be reassigned, so the number lives here.
 */
export const nativeBalanceTimeoutMs = {
  current: NATIVE_BALANCE_TIMEOUT_MS,
};

const BALANCE_READ_TIMEOUT_MESSAGE =
  'Balance unavailable: the wallet did not respond in time. Percentage buttons are disabled.';

/** Rejected by the balance-read race. Not shown to the user as-is. */
class NativeBalanceTimeoutError extends Error {
  constructor() {
    super('native-balance-timeout');
    this.name = 'NativeBalanceTimeoutError';
  }
}

/**
 * Publish the adapter's real state after a connect attempt.
 * Provider-unavailable throws before the adapter emits, so the context must
 * not keep an optimistic CONNECTING state that the session never entered.
 */
function reconcileAdapter(
  adapter: WalletAdapter,
  setState: (state: WalletState) => void,
  setAccount: (account: WalletAccount | null) => void
): void {
  setState(adapter.getState());
  setAccount(adapter.getAccount());
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  children,
  initialAdapter,
}: {
  children: React.ReactNode;
  initialAdapter?: WalletAdapter;
}) {
  const isMockWalletEnabled = useMemo(() => {
    return isMockWalletAllowed(
      Boolean(import.meta.env.DEV),
      import.meta.env.VITE_ENABLE_MOCK_WALLET
    );
  }, []);

  const [activeAdapter, setActiveAdapter] = useState<WalletAdapter>(() => {
    if (initialAdapter) return initialAdapter;
    return new InjectedWalletAdapter();
  });
  const activeAdapterRef = useRef<WalletAdapter>(activeAdapter);
  activeAdapterRef.current = activeAdapter;

  const [state, setState] = useState<WalletState>(activeAdapter.getState());
  const [account, setAccount] = useState<WalletAccount | null>(activeAdapter.getAccount());
  const [walletError, setWalletError] = useState<string | null>(null);
  const [invalidationVersion, setInvalidationVersion] = useState<number>(0);
  const [lastInvalidationReason, setLastInvalidationReason] = useState<InvalidationReason | null>(null);
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredEip6963Provider[]>(() => getDiscoveredProviders());
  const [legacyProviderAvailable, setLegacyProviderAvailable] = useState<boolean>(() => Boolean(readLegacyInjectedProvider()));
  const [walletSelectorNonce, setWalletSelectorNonce] = useState(0);

  const [nativeBalance, setNativeBalance] = useState<NativeBalanceState>({ status: 'hidden' });
  const [balanceNonce, setBalanceNonce] = useState(0);
  const balanceSeq = useRef(0);
  const refreshNativeBalance = useCallback(() => {
    setBalanceNonce((nonce) => nonce + 1);
  }, []);

  const [usdgBalance, setUsdgBalance] = useState<NativeBalanceState>({ status: 'hidden' });
  const [usdgBalanceNonce, setUsdgBalanceNonce] = useState(0);
  const usdgBalanceSeq = useRef(0);
  const refreshUsdgBalance = useCallback(() => {
    setUsdgBalanceNonce((nonce) => nonce + 1);
  }, []);

  const refreshBalances = useCallback(() => {
    setBalanceNonce((nonce) => nonce + 1);
    setUsdgBalanceNonce((nonce) => nonce + 1);
  }, []);

  // In-flight connection guard to prevent concurrent requests and duplicate clicks (HIGH 2)
  const isConnectingRef = useRef(false);
  const autoReconnectAttemptedRef = useRef(false);
  // Context-level connect generation to guard against auto-reconnect races with manual connect (QA-01)
  const connectGenerationRef = useRef(0);

  useEffect(() => {
    startEip6963Discovery();
    const syncDiscovery = () => {
      setDiscoveredProviders(getDiscoveredProviders());
      setLegacyProviderAvailable(Boolean(readLegacyInjectedProvider()));
    };
    syncDiscovery();
    return subscribeEip6963Providers(syncDiscovery);
  }, []);

  // W4: Auto-reconnect without popup when page loads and matching provider is discovered
  useEffect(() => {
    if (autoReconnectAttemptedRef.current) return;
    const savedRdns = readLastWalletRdns();
    if (!savedRdns) return;

    const match = discoveredProviders.find((entry) => entry.info.rdns === savedRdns);
    if (!match) return; // Wait until wallet announces

    autoReconnectAttemptedRef.current = true;
    if (isConnectingRef.current || state !== 'DISCONNECTED') return;

    const effectGeneration = connectGenerationRef.current;
    const adapter = new InjectedWalletAdapter(match.provider, match.info);
    void (async () => {
      try {
        const reconnected = await adapter.reconnect();
        if (
          reconnected &&
          !isConnectingRef.current &&
          connectGenerationRef.current === effectGeneration
        ) {
          activeAdapterRef.current.dispose?.();
          setActiveAdapter(adapter);
          reconcileAdapter(adapter, setState, setAccount);
        } else {
          adapter.dispose();
        }
      } catch {
        adapter.dispose();
      }
    })();
  }, [discoveredProviders, state]);

  const openWalletSelector = useCallback(() => {
    setWalletSelectorNonce((nonce) => nonce + 1);
  }, []);

  const runConnect = useCallback(async (
    adapter: WalletAdapter,
    publishAdapter: boolean
  ) => {
    if (publishAdapter) setActiveAdapter(adapter);
    setState('CONNECTING');
    try {
      await adapter.connect();
      reconcileAdapter(adapter, setState, setAccount);
      if (adapter instanceof InjectedWalletAdapter && adapter.rdns) {
        saveLastWalletRdns(adapter.rdns);
      }
    } catch (err) {
      reconcileAdapter(adapter, setState, setAccount);
      if (err instanceof StaleConnectSessionError) return;
      setWalletError(readErrorMessage(err, 'Failed to connect to browser wallet'));
      throw err;
    } finally {
      isConnectingRef.current = false;
    }
  }, []);

  const connectBoundProvider = useCallback(async (
    provider: Eip1193Provider | null,
    info: Eip6963ProviderInfo | null
  ) => {
    if (isConnectingRef.current || state === 'CONNECTING') return;
    if (getDiscoveredProviders().length > 1 && !provider) {
      openWalletSelector();
      return;
    }
    connectGenerationRef.current += 1;
    isConnectingRef.current = true;
    setWalletError(null);

    let adapter = activeAdapter;
    const sameProvider = provider
      && adapter instanceof InjectedWalletAdapter
      && adapter.getBoundProvider() === provider;
    if (!sameProvider) {
      adapter.dispose?.();
      adapter = provider
        ? new InjectedWalletAdapter(provider, info)
        : new InjectedWalletAdapter();
      await runConnect(adapter, true);
      return;
    }
    await runConnect(adapter, false);
  }, [activeAdapter, openWalletSelector, runConnect, state]);

  const connectDiscovered = useCallback(async (uuid: string) => {
    const match = getDiscoveredProviders().find((entry) => entry.info.uuid === uuid);
    if (!match) {
      const error = new Error('Selected wallet is no longer available. Choose another wallet.');
      setWalletError(error.message);
      throw error;
    }
    await connectBoundProvider(match.provider, match.info);
  }, [connectBoundProvider]);

  useEffect(() => {
    // Immediately synchronize snapshot with adapter
    setState(activeAdapter.getState());
    setAccount(activeAdapter.getAccount());

    const unsubState = activeAdapter.onStateChange((newState, newAccount) => {
      setState(newState);
      setAccount(newAccount);
    });

    const unsubInvalidation = activeAdapter.onInvalidation?.((reason) => {
      setInvalidationVersion((v) => v + 1);
      setLastInvalidationReason(reason);
    });

    return () => {
      unsubState();
      unsubInvalidation?.();
    };
  }, [activeAdapter]);

  const connectInjected = useCallback(async () => {
    const discovered = getDiscoveredProviders();
    if (discovered.length > 1) {
      openWalletSelector();
      return;
    }
    if (discovered.length === 1) {
      await connectBoundProvider(discovered[0].provider, discovered[0].info);
      return;
    }
    await connectBoundProvider(readLegacyInjectedProvider(), null);
  }, [connectBoundProvider, openWalletSelector]);

  const connect = useCallback(async () => {
    await connectInjected();
  }, [connectInjected]);

  const connectMock = useCallback(async () => {
    if (!import.meta.env.DEV || !isMockWalletEnabled) {
      const err = new Error('Mock Dev Wallet is strictly disabled in production builds');
      setWalletError(err.message);
      throw err;
    }
    if (isConnectingRef.current || state === 'CONNECTING') {
      return;
    }
    connectGenerationRef.current += 1;
    clearLastWalletRdns();
    isConnectingRef.current = true;
    setWalletError(null);

    let adapter = activeAdapter;
    if (!adapter.isMock) {
      adapter.dispose?.();
      const { MockWalletAdapter } = await import('./mock-wallet-adapter.js');
      adapter = new MockWalletAdapter();
      setActiveAdapter(adapter);
    }

    setState('CONNECTING');
    try {
      await adapter.connect();
      reconcileAdapter(adapter, setState, setAccount);
    } catch (err) {
      reconcileAdapter(adapter, setState, setAccount);
      if (err instanceof StaleConnectSessionError) {
        return;
      }
      setWalletError(readErrorMessage(err, 'Failed to connect to mock wallet'));
      throw err;
    } finally {
      isConnectingRef.current = false;
    }
  }, [activeAdapter, isMockWalletEnabled, state]);

  const disconnect = useCallback(async () => {
    connectGenerationRef.current += 1;
    clearLastWalletRdns();
    setWalletError(null);
    await activeAdapter.disconnect();
  }, [activeAdapter]);

  const switchChain = useCallback(async (chainId: number) => {
    setWalletError(null);
    try {
      await activeAdapter.switchChain(chainId);
    } catch (err) {
      setWalletError(readErrorMessage(err, 'Failed to switch network'));
      throw err;
    }
  }, [activeAdapter]);

  const switchToActiveNetwork = useCallback(async () => {
    const activeNetwork = getActiveNetworkConfig();
    await switchChain(activeNetwork.chainId);
  }, [switchChain]);

  const clearWalletError = useCallback(() => {
    setWalletError(null);
  }, []);

  const activeChainId = getActiveNetworkConfig().chainId;
  const balanceEligible = state === 'CONNECTED' && account?.chainId === activeChainId;

  // Read on CONNECTED (active chain), account change, chain change back to the
  // active chain, and explicit refresh. Any change drops the old value and
  // ignores late results from the previous read.
  useEffect(() => {
    const seq = balanceSeq.current + 1;
    balanceSeq.current = seq;
    if (!balanceEligible || !account) {
      setNativeBalance({ status: 'hidden' });
      return undefined;
    }
    if (typeof activeAdapter.getNativeBalance !== 'function') {
      setNativeBalance({ status: 'error', message: 'This wallet cannot report a balance.' });
      return undefined;
    }
    setNativeBalance({ status: 'loading' });
    const expectedAddress = account.address;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pendingRead = Promise.resolve(activeAdapter.getNativeBalance());
    // Keeps a rejection handled when it arrives after the timeout already won the race.
    void pendingRead.then(() => undefined, () => undefined);
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new NativeBalanceTimeoutError());
      }, nativeBalanceTimeoutMs.current);
    });

    const applyReading = (reading: NativeBalanceReading) => {
      if (balanceSeq.current !== seq) return;
      if (
        reading.address.toLowerCase() !== expectedAddress.toLowerCase()
        || reading.chainId !== activeChainId
        || !/^(?:0|[1-9]\d*)$/.test(reading.balanceWei)
      ) {
        setNativeBalance({ status: 'error', message: 'Balance unavailable: the wallet response did not match this account.' });
        return;
      }
      setNativeBalance({ status: 'ok', wei: BigInt(reading.balanceWei), isMock: reading.isMock });
    };

    void Promise.race([pendingRead, timeout]).then((reading) => {
      if (timer !== undefined) clearTimeout(timer);
      applyReading(reading);
    }, (err: unknown) => {
      if (timer !== undefined) clearTimeout(timer);
      if (balanceSeq.current !== seq) return;
      // Advance the generation, same as effect cleanup, so a late success is ignored.
      if (err instanceof NativeBalanceTimeoutError) balanceSeq.current = seq + 1;
      setNativeBalance({
        status: 'error',
        message: err instanceof NativeBalanceTimeoutError
          ? BALANCE_READ_TIMEOUT_MESSAGE
          : 'Balance unavailable. Percentage buttons are disabled.',
      });
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (balanceSeq.current === seq) balanceSeq.current = seq + 1;
    };
  }, [activeAdapter, balanceEligible, account?.address, account?.chainId, activeChainId, invalidationVersion, balanceNonce]);

  useEffect(() => {
    const seq = usdgBalanceSeq.current + 1;
    usdgBalanceSeq.current = seq;
    if (!balanceEligible || !account) {
      setUsdgBalance({ status: 'hidden' });
      return undefined;
    }
    if (typeof activeAdapter.getUsdgBalance !== 'function') {
      setUsdgBalance({ status: 'error', message: 'This wallet cannot report USDG balance.' });
      return undefined;
    }
    setUsdgBalance({ status: 'loading' });
    const expectedAddress = account.address;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pendingRead = Promise.resolve(activeAdapter.getUsdgBalance());
    void pendingRead.then(() => undefined, () => undefined);
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new NativeBalanceTimeoutError());
      }, nativeBalanceTimeoutMs.current);
    });

    const applyReading = (reading: NativeBalanceReading) => {
      if (usdgBalanceSeq.current !== seq) return;
      if (
        reading.address.toLowerCase() !== expectedAddress.toLowerCase()
        || reading.chainId !== activeChainId
        || !/^(?:0|[1-9]\d*)$/.test(reading.balanceWei)
      ) {
        setUsdgBalance({ status: 'error', message: 'USDG balance unavailable: response mismatch.' });
        return;
      }
      setUsdgBalance({ status: 'ok', wei: BigInt(reading.balanceWei), isMock: reading.isMock });
    };

    void Promise.race([pendingRead, timeout]).then((reading) => {
      if (timer !== undefined) clearTimeout(timer);
      applyReading(reading);
    }, (err: unknown) => {
      if (timer !== undefined) clearTimeout(timer);
      if (usdgBalanceSeq.current !== seq) return;
      if (err instanceof NativeBalanceTimeoutError) usdgBalanceSeq.current = seq + 1;
      setUsdgBalance({
        status: 'error',
        message: err instanceof NativeBalanceTimeoutError
          ? BALANCE_READ_TIMEOUT_MESSAGE
          : 'USDG balance unavailable.',
      });
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (usdgBalanceSeq.current === seq) usdgBalanceSeq.current = seq + 1;
    };
  }, [activeAdapter, balanceEligible, account?.address, account?.chainId, activeChainId, invalidationVersion, usdgBalanceNonce]);

  const clearDroppedPendingSwap = useCallback(async (userConfirmed: boolean) => {
    if (typeof activeAdapter.clearDroppedPendingSwap !== 'function') {
      throw new Error('This wallet adapter cannot clear pending swaps.');
    }
    return activeAdapter.clearDroppedPendingSwap(userConfirmed);
  }, [activeAdapter]);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as unknown as { __robexWallet?: unknown }).__robexWallet = {
        adapter: activeAdapter,
        isMock: activeAdapter.isMock,
        switchChain,
        switchToActiveNetwork,
        disconnect,
      };
    }
  }, [activeAdapter, switchChain, switchToActiveNetwork, disconnect]);

  const value = useMemo(
    () => ({
      adapter: activeAdapter,
      state,
      account,
      walletName: activeAdapter.name,
      walletType: activeAdapter.type,
      hasInjectedProvider: discoveredProviders.length > 0 || legacyProviderAvailable || activeAdapter.hasProvider(),
      discoveredProviders,
      legacyProviderAvailable,
      isMockWallet: activeAdapter.isMock,
      isMockWalletEnabled,
      connect,
      connectInjected,
      connectDiscovered,
      openWalletSelector,
      walletSelectorNonce,
      connectMock,
      disconnect,
      switchChain,
      switchToActiveNetwork,
      walletError,
      clearWalletError,
      invalidationVersion,
      lastInvalidationReason,
      nativeBalance,
      refreshNativeBalance,
      usdgBalance,
      refreshUsdgBalance,
      refreshBalances,
      clearDroppedPendingSwap,
    }),
    [
      activeAdapter,
      state,
      account,
      discoveredProviders,
      legacyProviderAvailable,
      isMockWalletEnabled,
      connect,
      connectInjected,
      connectDiscovered,
      openWalletSelector,
      walletSelectorNonce,
      connectMock,
      disconnect,
      switchChain,
      switchToActiveNetwork,
      walletError,
      clearWalletError,
      invalidationVersion,
      lastInvalidationReason,
      nativeBalance,
      refreshNativeBalance,
      usdgBalance,
      refreshUsdgBalance,
      refreshBalances,
      clearDroppedPendingSwap,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
