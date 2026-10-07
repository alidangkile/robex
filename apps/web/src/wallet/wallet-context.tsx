import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { WalletAccount, WalletAdapter, WalletState } from '@robex/types';
import { MockWalletAdapter } from './mock-wallet-adapter.js';

interface WalletContextValue {
  adapter: WalletAdapter;
  state: WalletState;
  account: WalletAccount | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  sendTransaction: (to: string, data?: string, value?: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  children,
  initialAdapter,
}: {
  children: React.ReactNode;
  initialAdapter?: WalletAdapter;
}) {
  const adapter = useMemo(() => initialAdapter || new MockWalletAdapter(), [initialAdapter]);
  const [state, setState] = useState<WalletState>(adapter.getState());
  const [account, setAccount] = useState<WalletAccount | null>(adapter.getAccount());

  useEffect(() => {
    const unsubscribe = adapter.onStateChange((newState, newAccount) => {
      setState(newState);
      setAccount(newAccount);
    });
    return unsubscribe;
  }, [adapter]);

  const connect = async () => {
    try {
      await adapter.connect();
    } catch (err) {
      console.error('Wallet connection failed:', err);
    }
  };

  const disconnect = async () => {
    await adapter.disconnect();
  };

  const switchChain = async (chainId: number) => {
    await adapter.switchChain(chainId);
  };

  const sendTransaction = async (to: string, data?: string, value?: string) => {
    return adapter.sendTransaction({ to, data, value });
  };

  return (
    <WalletContext.Provider
      value={{
        adapter,
        state,
        account,
        connect,
        disconnect,
        switchChain,
        sendTransaction,
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
