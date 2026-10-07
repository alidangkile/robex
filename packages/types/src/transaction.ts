export type TransactionState =
  | 'IDLE'
  | 'PREPARING'
  | 'AWAITING_WALLET'
  | 'SUBMITTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'REFETCHING_STATE'
  | 'SUCCESS'
  | 'REJECTED'
  | 'REVERTED'
  | 'EXPIRED'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR';

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
