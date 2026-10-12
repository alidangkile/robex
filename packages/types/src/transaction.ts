export type SwapTransactionState =
  | 'ready'
  | 'wallet_confirmation'
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'reverted'
  | 'rejected'
  | 'expired'
  | 'wrong_network'
  | 'insufficient_balance'
  | 'provider_error'
  | 'timeout'
  | 'anomaly';

export type TransactionState = SwapTransactionState;

export interface TransactionRecord {
  id: string;
  hash?: string;
  state: TransactionState;
  chainId: number;
  from: string;
  to: string;
  actionType: 'SWAP' | 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY' | 'APPROVAL' | 'CLAIM';
  createdAt: number;
  updatedAt: number;
  error?: string;
}
