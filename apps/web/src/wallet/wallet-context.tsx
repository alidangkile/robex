import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { InvalidationReason, WalletAccount, WalletAdapter, WalletState, WalletType } from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';
import { InjectedWalletAdapter, StaleConnectSessionError } from './injected-wallet-adapter.js';
import { MockWalletAdapter } from './mock-wallet-adapter.js';

interface WalletContextValue {
  adapter: WalletAdapter;
  state: WalletState;
  account: WalletAccount | null;
  walletName: string;
  walletType: WalletType;
  hasInjectedProvider: boolean;
  isMockWallet: boolean;
  isMockWalletEnabled: boolean;
  connect: () => Promise<void>;
  connectInjected: () => Promise<void>;
  connectMock: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  switchToActiveNetwork: () => Promise<void>;
  walletError: string | null;
  clearWalletError: () => void;
  invalidationVersion: number;
  lastInvalidationReason: InvalidationReason | null;
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

  const [state, setState] = useState<WalletState>(activeAdapter.getState());
  const [account, setAccount] = useState<WalletAccount | null>(activeAdapter.getAccount());
  const [walletError, setWalletError] = useState<string | null>(null);
  const [invalidationVersion, setInvalidationVersion] = useState<number>(0);
  const [lastInvalidationReason, setLastInvalidationReason] = useState<InvalidationReason | null>(null);

  // In-flight connection guard to prevent concurrent requests and duplicate clicks (HIGH 2)
  const isConnectingRef = useRef(false);

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
    if (isConnectingRef.current || state === 'CONNECTING') {
      return;
    }
    isConnectingRef.current = true;
    setWalletError(null);

    let adapter = activeAdapter;
    if (adapter.isMock || !(adapter instanceof InjectedWalletAdapter)) {
      adapter.dispose?.();
      adapter = new InjectedWalletAdapter();
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
      setWalletError(readErrorMessage(err, 'Failed to connect to browser wallet'));
      throw err;
    } finally {
      isConnectingRef.current = false;
    }
  }, [activeAdapter, state]);

  const connectMock = useCallback(async () => {
    if (!isMockWalletEnabled) {
      const err = new Error('Mock Dev Wallet is strictly disabled in production builds');
      setWalletError(err.message);
      throw err;
    }
    if (isConnectingRef.current || state === 'CONNECTING') {
      return;
    }
    isConnectingRef.current = true;
    setWalletError(null);

    let adapter = activeAdapter;
    if (!adapter.isMock || !(adapter instanceof MockWalletAdapter)) {
      adapter.dispose?.();
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

  return (
    <WalletContext.Provider
      value={{
        adapter: activeAdapter,
        state,
        account,
        walletName: activeAdapter.name,
        walletType: activeAdapter.type,
        hasInjectedProvider: activeAdapter.hasProvider(),
        isMockWallet: activeAdapter.isMock,
        isMockWalletEnabled,
        connect: connectInjected,
        connectInjected,
        connectMock,
        disconnect,
        switchChain,
        switchToActiveNetwork,
        walletError,
        clearWalletError,
        invalidationVersion,
        lastInvalidationReason,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
