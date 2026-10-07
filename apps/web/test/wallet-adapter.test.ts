import { describe, it, expect } from 'vitest';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';

describe('Wallet Abstraction Foundation', () => {
  it('initializes in DISCONNECTED state', () => {
    const adapter = new MockWalletAdapter();
    expect(adapter.getState()).toBe('DISCONNECTED');
    expect(adapter.getAccount()).toBeNull();
  });

  it('progresses to CONNECTED upon connect()', async () => {
    const adapter = new MockWalletAdapter();
    const account = await adapter.connect();

    expect(adapter.getState()).toBe('CONNECTED');
    expect(account.chainId).toBe(46630);
    expect(account.address).toBeDefined();
  });

  it('notifies listeners on state change', async () => {
    const adapter = new MockWalletAdapter();
    const states: string[] = [];

    const unsubscribe = adapter.onStateChange((state) => {
      states.push(state);
    });

    await adapter.connect();
    await adapter.disconnect();

    expect(states).toContain('CONNECTING');
    expect(states).toContain('CONNECTED');
    expect(states).toContain('DISCONNECTED');

    unsubscribe();
  });

  it('transitions to WRONG_NETWORK when switched away from Robinhood Chain', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();

    await adapter.switchChain(1); // Ethereum Mainnet
    expect(adapter.getState()).toBe('WRONG_NETWORK');

    await adapter.switchChain(46630); // Back to Robinhood Testnet
    expect(adapter.getState()).toBe('CONNECTED');
  });

  it('enforces safety invariant: sendTransaction throws NOT_IMPLEMENTED in Plan 001', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();

    await expect(
      adapter.sendTransaction({ to: '0x0000000000000000000000000000000000000001' })
    ).rejects.toThrow('NOT_IMPLEMENTED: Transaction execution is disabled in Plan 001 foundation');
  });
});
