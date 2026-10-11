export type WalletType =
  | 'METAMASK'
  | 'RABBY'
  | 'INJECTED'
  | 'WALLETCONNECT'
  | 'MOCK';

export type WalletState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'WRONG_NETWORK'
  | 'UNSUPPORTED_NETWORK';

export type InvalidationReason = 'account' | 'chain' | 'disconnect';

export interface WalletAccount {
  address: string;
  chainId: number;
}

/**
 * Native-token balance read through the connected wallet (Plan 003B
 * Amendment 1, §6A). Read-only: no signature, no transaction.
 */
export interface NativeBalanceReading {
  address: string;
  chainId: number;
  /** Decimal string of the wei balance. */
  balanceWei: string;
  /** True only for the dev mock wallet's fixture balance. */
  isMock: boolean;
}

export interface SendTransactionRequest {
  to: string;
  data?: string;
  value?: string;
  gasLimit?: string;
}

export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  status: 'SUCCESS' | 'REVERTED';
}

/**
 * Universal Wallet Adapter Interface.
 * Features interact strictly through this interface to prevent vendor lock-in.
 * NOTE: Transaction execution is strictly disabled in Plan 002.
 */
export interface WalletAdapter {
  id: string;
  name: string;
  type: WalletType;
  isMock: boolean;
  hasProvider(): boolean;
  getState(): WalletState;
  getAccount(): WalletAccount | null;
  connect(): Promise<WalletAccount>;
  disconnect(): Promise<void>;
  switchChain(chainId: number): Promise<void>;
  sendTransaction(tx: SendTransactionRequest): Promise<string>;
  /** Read-only native balance of the connected account on the active chain. */
  getNativeBalance?(): Promise<NativeBalanceReading>;
  dispose?(): void;
  onStateChange(listener: (state: WalletState, account: WalletAccount | null) => void): () => void;
  onInvalidation?(listener: (reason: InvalidationReason) => void): () => void;
}
