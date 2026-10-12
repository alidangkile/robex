import type { SwapTransactionState } from './transaction.js';

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

export interface V4PoolKey {
  currency0: string;
  currency1: string;
  feePips: number;
  tickSpacing: number;
  hooks: string;
}

export interface SlippageToleranceInput {
  slippageBps?: number;
  slippageTolerancePercent?: number;
}

export type SwapStateChangeCallback = (
  state: SwapTransactionState,
  details?: unknown
) => void;

export interface SendSwapTransactionParams {
  chainId: number;
  amountIn: bigint;
  amountOut: bigint;
  slippage?: SlippageToleranceInput;
  deadline?: bigint;
  poolKey?: V4PoolKey;
}

export interface SwapExecutionReceipt {
  status: string | null | undefined;
  to: string;
  from: string;
  blockNumber: bigint;
  transactionHash: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

export interface SendSwapTransactionResult {
  state: SwapTransactionState;
  txHash?: string;
  receipt?: SwapExecutionReceipt;
  actualAmountReceived?: bigint;
  amountOutMinimum?: bigint;
  slippageExceeded?: boolean;
  hasDecodeFailure?: boolean;
  anomalyReason?: string;
  error?: string;
}

/**
 * Universal Wallet Adapter Interface.
 * Features interact strictly through this interface to prevent vendor lock-in.
 * NOTE: sendSwapTransaction is the only send path (C1 PR 2A).
 * General-purpose sendTransaction is removed.
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
  sendSwapTransaction(
    params: SendSwapTransactionParams,
    onStateChange?: SwapStateChangeCallback
  ): Promise<SendSwapTransactionResult>;
  /** Read-only native balance of the connected account on the active chain. */
  getNativeBalance?(): Promise<NativeBalanceReading>;
  /** Read-only USDG ERC-20 balance of the connected account on the active chain. */
  getUsdgBalance?(): Promise<NativeBalanceReading>;
  /** Clears dropped pending swap after user confirmation (10+ min elapsed). */
  clearDroppedPendingSwap?(userConfirmed: boolean): Promise<boolean>;
  dispose?(): void;
  onStateChange(listener: (state: WalletState, account: WalletAccount | null) => void): () => void;
  onInvalidation?(listener: (reason: InvalidationReason) => void): () => void;
}
