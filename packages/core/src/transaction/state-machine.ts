import type { TransactionState } from '@robex/types';

const VALID_TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  IDLE: ['PREPARING'],
  PREPARING: ['AWAITING_WALLET', 'NETWORK_ERROR', 'PROVIDER_ERROR', 'IDLE'],
  AWAITING_WALLET: ['SUBMITTED', 'REJECTED', 'EXPIRED', 'NETWORK_ERROR'],
  SUBMITTED: ['PENDING', 'NETWORK_ERROR', 'PROVIDER_ERROR'],
  PENDING: ['CONFIRMED', 'REVERTED', 'EXPIRED', 'NETWORK_ERROR'],
  CONFIRMED: ['REFETCHING_STATE'],
  REFETCHING_STATE: ['SUCCESS', 'NETWORK_ERROR'],
  SUCCESS: ['IDLE'],
  REJECTED: ['IDLE'],
  REVERTED: ['IDLE'],
  EXPIRED: ['IDLE'],
  NETWORK_ERROR: ['IDLE', 'PREPARING'],
  PROVIDER_ERROR: ['IDLE', 'PREPARING'],
};

const TERMINAL_FAILURE_STATES: Set<TransactionState> = new Set([
  'REJECTED',
  'REVERTED',
  'EXPIRED',
  'NETWORK_ERROR',
  'PROVIDER_ERROR',
]);

export function canTransitionTransaction(
  current: TransactionState,
  next: TransactionState
): boolean {
  // CRITICAL INVARIANT: Never jump from AWAITING_WALLET directly to SUCCESS
  if (current === 'AWAITING_WALLET' && next === 'SUCCESS') {
    return false;
  }
  const allowed = VALID_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export function transitionTransaction(
  current: TransactionState,
  next: TransactionState
): TransactionState {
  if (!canTransitionTransaction(current, next)) {
    throw new Error(
      `Invalid transaction state transition from ${current} to ${next}`
    );
  }
  return next;
}

export function isTerminalFailure(state: TransactionState): boolean {
  return TERMINAL_FAILURE_STATES.has(state);
}

export function isCompleted(state: TransactionState): boolean {
  return state === 'SUCCESS';
}
