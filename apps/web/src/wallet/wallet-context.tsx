import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { WalletAccount, WalletAdapter, WalletState } from '@robex/types';
import { InjectedWalletAdapter } from './injected-wallet-adapter.js';
import { MockWalletAdapter } from './mock-wallet-adapter.js';

interface WalletContextValue {
  adapter: WalletAdapter;
  state: WalletState;
  account: WalletAccount | null;
  isMockWallet: boolean;
  isMockWalletEnabled: boolean;
  connect: () => Promise<void>;
  connectInjected: () => Promise<void>;
  connectMock: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  walletError: string | null;
  clearWalletError: () => void;
  // NOTE: sendTransaction is NOT exposed in Plan 001 application context (Finding 4)
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
    return Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_WALLET === 'true');
  }, []);

  const [activeAdapter, setActiveAdapter] = useState<WalletAdapter>(() => {
    if (initialAdapter) return initialAdapter;
    // Default to Injected (real) wallet adapter
    return new InjectedWalletAdapter();
  });

  const [state, setState] = useState<WalletState>(activeAdapter.getState());
  const [account, setAccount] = useState<WalletAccount | null>(activeAdapter.getAccount());
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = activeAdapter.onStateChange((newState, newAccount) => {
      setState(newState);
      setAccount(newAccount);
    });
    return unsubscribe;
  }, [activeAdapter]);

  const connectInjected = useCallback(async () => {
    setWalletError(null);
    const injectedAdapter = new InjectedWalletAdapter();
    setActiveAdapter(injectedAdapter);

    try {
      await injectedAdapter.connect();
    } catch (err) {
      // INVARIANT: Never silently fall back to mock wallet if real wallet connection fails! (Finding 2)
      const errorMsg = (err as Error).message || 'Failed to connect to browser wallet';
      setWalletError(errorMsg);
      throw err;
    }
  }, []);

  const connectMock = useCallback(async () => {
    if (!isMockWalletEnabled) {
      const err = new Error('Mock Dev Wallet is disabled in this environment');
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
    await activeAdapter.switchChain(chainId);
  }, [activeAdapter]);

  const clearWalletError = useCallback(() => {
    setWalletError(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        adapter: activeAdapter,
        state,
        account,
        isMockWallet: activeAdapter.isMock,
        isMockWalletEnabled,
        connect: connectInjected, // Default connect action attempts injected wallet
        connectInjected,
        connectMock,
        disconnect,
        switchChain,
        walletError,
        clearWalletError,
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
