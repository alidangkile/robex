import { describe, it, expect } from 'vitest';
import {
  canTransitionTransaction,
  transitionTransaction,
  isTerminalFailure,
  isTerminalState,
  isSuccessState,
  isCompleted,
} from '../src/transaction/state-machine.js';
import type { SwapTransactionState } from '@robex/types';

describe('Transaction State Machine Foundation (C1 PR 2A)', () => {
  it('allows valid progressive transaction flow: ready -> wallet_confirmation -> submitted -> pending -> confirmed', () => {
    let state: SwapTransactionState = 'ready';
    state = transitionTransaction(state, 'wallet_confirmation');
    expect(state).toBe('wallet_confirmation');
    expect(isSuccessState(state)).toBe(false);

    state = transitionTransaction(state, 'submitted');
    expect(state).toBe('submitted');
    // CRITICAL INVARIANT: A tx hash alone is NEVER success!
    expect(isSuccessState(state)).toBe(false);
    expect(isCompleted(state)).toBe(false);

    state = transitionTransaction(state, 'pending');
    expect(state).toBe('pending');
    expect(isSuccessState(state)).toBe(false);

    state = transitionTransaction(state, 'confirmed');
    expect(state).toBe('confirmed');
    expect(isSuccessState(state)).toBe(true);
    expect(isCompleted(state)).toBe(true);
    expect(isTerminalState(state)).toBe(true);
  });

  it('enforces CRITICAL INVARIANT: a tx hash alone (submitted or pending) is NEVER success', () => {
    expect(isSuccessState('submitted')).toBe(false);
    expect(isSuccessState('pending')).toBe(false);
    expect(isCompleted('submitted')).toBe(false);
    expect(isCompleted('pending')).toBe(false);

    // Cannot jump directly from ready or wallet_confirmation to confirmed
    expect(canTransitionTransaction('ready', 'confirmed')).toBe(false);
    expect(canTransitionTransaction('wallet_confirmation', 'confirmed')).toBe(false);
    expect(() => transitionTransaction('ready', 'confirmed')).toThrow();
    expect(() => transitionTransaction('wallet_confirmation', 'confirmed')).toThrow();
  });

  it('handles user wallet rejection (code 4001) from wallet_confirmation', () => {
    let state: SwapTransactionState = 'ready';
    state = transitionTransaction(state, 'wallet_confirmation');
    state = transitionTransaction(state, 'rejected');

    expect(state).toBe('rejected');
    expect(isTerminalFailure(state)).toBe(true);
    expect(isTerminalState(state)).toBe(true);
    expect(isSuccessState(state)).toBe(false);
  });

  it('handles on-chain revert from pending', () => {
    let state: SwapTransactionState = 'ready';
    state = transitionTransaction(state, 'wallet_confirmation');
    state = transitionTransaction(state, 'submitted');
    state = transitionTransaction(state, 'pending');
    state = transitionTransaction(state, 'reverted');

    expect(state).toBe('reverted');
    expect(isTerminalFailure(state)).toBe(true);
    expect(isTerminalState(state)).toBe(true);
    expect(isSuccessState(state)).toBe(false);
  });

  it('handles 180s receipt timeout from pending and keeps hash', () => {
    let state: SwapTransactionState = 'ready';
    state = transitionTransaction(state, 'wallet_confirmation');
    state = transitionTransaction(state, 'submitted');
    state = transitionTransaction(state, 'pending');
    state = transitionTransaction(state, 'timeout');

    expect(state).toBe('timeout');
    expect(isTerminalState(state)).toBe(true);
    // Timeout keeps the hash and is not classified as failure per spec
    expect(isTerminalFailure(state)).toBe(false);
    expect(isSuccessState(state)).toBe(false);
  });

  it('handles pre-send guard abort branches from ready', () => {
    expect(canTransitionTransaction('ready', 'wrong_network')).toBe(true);
    expect(canTransitionTransaction('ready', 'expired')).toBe(true);
    expect(canTransitionTransaction('ready', 'insufficient_balance')).toBe(true);
    expect(canTransitionTransaction('ready', 'provider_error')).toBe(true);
    expect(canTransitionTransaction('ready', 'rejected')).toBe(true);

    expect(isTerminalFailure('wrong_network')).toBe(true);
    expect(isTerminalFailure('expired')).toBe(true);
    expect(isTerminalFailure('insufficient_balance')).toBe(true);
    expect(isTerminalFailure('provider_error')).toBe(true);
  });

  it('rejects invalid state jumps', () => {
    // Cannot skip wallet_confirmation
    expect(canTransitionTransaction('ready', 'submitted')).toBe(false);
    expect(canTransitionTransaction('ready', 'pending')).toBe(false);

    // Cannot transition from confirmed to pending or submitted
    expect(canTransitionTransaction('confirmed', 'pending')).toBe(false);
    expect(canTransitionTransaction('confirmed', 'submitted')).toBe(false);

    // Throws on illegal transition
    expect(() => transitionTransaction('ready', 'pending')).toThrow(
      'Invalid transaction state transition from ready to pending'
    );
  });
});
