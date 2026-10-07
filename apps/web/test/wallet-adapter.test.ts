import { describe, it, expect } from 'vitest';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';
import { InjectedWalletAdapter } from '../src/wallet/injected-wallet-adapter.js';
import { getActiveNetworkConfig } from '@robex/config';

describe('Wallet Abstraction Foundation', () => {
  const activeNetwork = getActiveNetworkConfig();

  it('distinguishes between mock wallet and real injected wallet', () => {
    const mockAdapter = new MockWalletAdapter();
    const injectedAdapter = new InjectedWalletAdapter();

    expect(mockAdapter.isMock).toBe(true);
    expect(mockAdapter.type).toBe('MOCK');

    expect(injectedAdapter.isMock).toBe(false);
    expect(injectedAdapter.type).toBe('INJECTED');
  });

  it('initializes in DISCONNECTED state', () => {
    const adapter = new MockWalletAdapter();
    expect(adapter.getState()).toBe('DISCONNECTED');
    expect(adapter.getAccount()).toBeNull();
  });

  it('connects to active centralized network config without hardcoded chain ID', async () => {
    const adapter = new MockWalletAdapter();
    const account = await adapter.connect();

    expect(adapter.getState()).toBe('CONNECTED');
    expect(account.chainId).toBe(activeNetwork.chainId);
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

  it('transitions to WRONG_NETWORK when switched away from active Robinhood Chain', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();

    await adapter.switchChain(1); // Ethereum Mainnet
    expect(adapter.getState()).toBe('WRONG_NETWORK');

    await adapter.switchChain(activeNetwork.chainId); // Back to active network
    expect(adapter.getState()).toBe('CONNECTED');
  });

  // Finding 4 Verification: Both adapters strictly block transaction execution in Plan 001
  it('enforces safety invariant: MockWalletAdapter blocks transaction execution', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();

    await expect(
      adapter.sendTransaction({ to: '0x0000000000000000000000000000000000000001' })
    ).rejects.toThrow('DISABLED_IN_PLAN_001: Transaction execution is strictly disabled in Plan 001 foundation');
  });

  it('enforces safety invariant: InjectedWalletAdapter blocks transaction execution', async () => {
    const adapter = new InjectedWalletAdapter();
    await expect(
      adapter.sendTransaction({ to: '0x0000000000000000000000000000000000000001' })
    ).rejects.toThrow('DISABLED_IN_PLAN_001: Transaction execution is strictly disabled in Plan 001 foundation');
  });
});
