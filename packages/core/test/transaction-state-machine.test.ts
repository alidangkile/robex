import { describe, it, expect } from 'vitest';
import {
  canTransitionTransaction,
  transitionTransaction,
  isTerminalFailure,
  isCompleted,
} from '../src/transaction/state-machine.js';

describe('Transaction State Machine Foundation', () => {
  it('allows valid progressive transaction flow', () => {
    let state = transitionTransaction('IDLE', 'PREPARING');
    state = transitionTransaction(state, 'AWAITING_WALLET');
    state = transitionTransaction(state, 'SUBMITTED');
    state = transitionTransaction(state, 'PENDING');
    state = transitionTransaction(state, 'CONFIRMED');
    state = transitionTransaction(state, 'REFETCHING_STATE');
    state = transitionTransaction(state, 'SUCCESS');

    expect(isCompleted(state)).toBe(true);
  });

  it('enforces CRITICAL INVARIANT: never jump from AWAITING_WALLET directly to SUCCESS', () => {
    expect(canTransitionTransaction('AWAITING_WALLET', 'SUCCESS')).toBe(false);
    expect(() => transitionTransaction('AWAITING_WALLET', 'SUCCESS')).toThrow(
      'Invalid transaction state transition from AWAITING_WALLET to SUCCESS'
    );
  });

  it('correctly handles user wallet rejection and terminal states', () => {
    const rejectedState = transitionTransaction('AWAITING_WALLET', 'REJECTED');
    expect(isTerminalFailure(rejectedState)).toBe(true);
    expect(isCompleted(rejectedState)).toBe(false);
  });
});
