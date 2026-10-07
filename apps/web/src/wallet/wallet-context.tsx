import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { InvalidationReason, WalletAccount, WalletAdapter, WalletState, WalletType } from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';
import { InjectedWalletAdapter } from './injected-wallet-adapter.js';
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

  useEffect(() => {
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
    setWalletError(null);
    const injectedAdapter = new InjectedWalletAdapter();
    setActiveAdapter(injectedAdapter);

    try {
      await injectedAdapter.connect();
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to connect to browser wallet';
      setWalletError(errorMsg);
      throw err;
    }
  }, []);

  const connectMock = useCallback(async () => {
    if (!isMockWalletEnabled) {
      const err = new Error('Mock Dev Wallet is strictly disabled in production builds');
      setWalletError(err.message);
      throw err;
    }
    setWalletError(null);
    const mockAdapter = new MockWalletAdapter();
    setActiveAdapter(mockAdapter);
    await mockAdapter.connect();
  }, [isMockWalletEnabled]);

  const disconnect = useCallback(async () => {
    setWalletError(null);
    await activeAdapter.disconnect();
  }, [activeAdapter]);

  const switchChain = useCallback(async (chainId: number) => {
    setWalletError(null);
    try {
      await activeAdapter.switchChain(chainId);
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to switch network';
      setWalletError(errorMsg);
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
