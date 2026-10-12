import type { SwapTransactionState } from '@robex/types';

/**
 * Valid state transitions for the C1 PR 2A Swap Transaction State Machine.
 * Lifecycle: ready -> wallet_confirmation -> submitted -> pending -> confirmed | reverted
 * Abort/error branches: rejected (code 4001), expired, wrong_network, insufficient_balance, provider_error, timeout.
 */
const VALID_TRANSITIONS: Record<SwapTransactionState, SwapTransactionState[]> = {
  ready: [
    'wallet_confirmation',
    'wrong_network',
    'expired',
    'insufficient_balance',
    'provider_error',
    'rejected',
  ],
  wallet_confirmation: [
    'submitted',
    'rejected',
    'expired',
    'provider_error',
  ],
  submitted: [
    'pending',
    'confirmed',
    'reverted',
    'timeout',
    'provider_error',
    'anomaly',
  ],
  pending: [
    'confirmed',
    'reverted',
    'timeout',
    'provider_error',
    'anomaly',
  ],
  confirmed: ['ready'],
  reverted: ['ready'],
  rejected: ['ready'],
  expired: ['ready'],
  wrong_network: ['ready'],
  insufficient_balance: ['ready'],
  provider_error: ['ready'],
  timeout: ['ready'],
  anomaly: ['ready'],
};

const TERMINAL_FAILURE_STATES = new Set<SwapTransactionState>([
  'reverted',
  'rejected',
  'expired',
  'wrong_network',
  'insufficient_balance',
  'provider_error',
  'anomaly',
]);

const TERMINAL_STATES = new Set<SwapTransactionState>([
  'confirmed',
  'reverted',
  'rejected',
  'expired',
  'wrong_network',
  'insufficient_balance',
  'provider_error',
  'timeout',
  'anomaly',
]);

export function canTransitionTransaction(
  current: SwapTransactionState,
  next: SwapTransactionState
): boolean {
  // CRITICAL INVARIANT: A tx hash alone is never success.
  // Neither ready nor wallet_confirmation can transition directly to confirmed, pending, or anomaly.
  if ((current === 'ready' || current === 'wallet_confirmation') && (next === 'confirmed' || next === 'anomaly')) {
    return false;
  }
  if (current === 'ready' && (next === 'submitted' || next === 'pending')) {
    return false;
  }
  const allowed = VALID_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export function transitionTransaction(
  current: SwapTransactionState,
  next: SwapTransactionState
): SwapTransactionState {
  if (!canTransitionTransaction(current, next)) {
    throw new Error(
      `Invalid transaction state transition from ${current} to ${next}`
    );
  }
  return next;
}

export function isTerminalState(state: SwapTransactionState): boolean {
  return TERMINAL_STATES.has(state);
}

export function isTerminalFailure(state: SwapTransactionState): boolean {
  return TERMINAL_FAILURE_STATES.has(state);
}

/**
 * Returns true only when confirmed on-chain with verified status 0x1 and matched to/from.
 * A tx hash alone (submitted or pending) is NEVER success.
 */
export function isSuccessState(state: SwapTransactionState): boolean {
  return state === 'confirmed';
}

export function isCompleted(state: SwapTransactionState): boolean {
  return isSuccessState(state);
}
