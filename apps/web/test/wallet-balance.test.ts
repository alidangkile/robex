/**
 * Amendment 1 §6A: read-only native balance through the connected wallet.
 * Uses fake EIP-1193 providers and the dev mock wallet, not a real extension.
 */
import { describe, expect, it } from 'vitest';
import { getActiveNetworkConfig } from '@robex/config';
import { InjectedWalletAdapter } from '../src/wallet/injected-wallet-adapter.js';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';

const ADDRESS = '0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B';
const ACTIVE = getActiveNetworkConfig().chainId;

class FakeProvider {
  calls: { method: string; params?: unknown }[] = [];
  chainId = `0x${ACTIVE.toString(16)}`;
  /** chainId returned for the eth_chainId call made by getNativeBalance (after connect). */
  balanceChainId: string | null = null;
  balance: unknown = '0xde0b6b3a7640003';
  balanceGate: Promise<void> | null = null;
  handlers = new Map<string, (...args: unknown[]) => void>();
  connected = false;

  async request(args: { method: string; params?: unknown }): Promise<unknown> {
    this.calls.push({ method: args.method, params: args.params });
    if (args.method === 'eth_requestAccounts') return [ADDRESS];
    if (args.method === 'eth_chainId') {
      if (this.connected && this.balanceChainId !== null) return this.balanceChainId;
      return this.chainId;
    }
    if (args.method === 'eth_getBalance') {
      if (this.balanceGate) await this.balanceGate;
      if (this.balance instanceof Error) throw this.balance;
      return this.balance;
    }
    throw new Error(`unexpected ${args.method}`);
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
  }

  removeListener(event: string) {
    this.handlers.delete(event);
  }
}

async function connected(provider = new FakeProvider()) {
  const adapter = new InjectedWalletAdapter(provider);
  await adapter.connect();
  provider.connected = true;
  provider.calls.length = 0;
  return { adapter, provider };
}

describe('InjectedWalletAdapter.getNativeBalance (read-only)', () => {
  it('reads with only eth_chainId and eth_getBalance and returns an exact wei string', async () => {
    const { adapter, provider } = await connected();
    const reading = await adapter.getNativeBalance();
    expect(reading).toEqual({ address: ADDRESS, chainId: ACTIVE, balanceWei: '1000000000000000003', isMock: false });
    expect(provider.calls.map((c) => c.method)).toEqual(['eth_chainId', 'eth_getBalance']);
    expect(provider.calls[1]?.params).toEqual([ADDRESS, 'latest']);
    const methods = provider.calls.map((c) => c.method).join(',');
    expect(methods).not.toMatch(/send|sign|estimateGas|approve/i);
  });

  it('fails closed when the wallet reports another chain during the read', async () => {
    const { adapter, provider } = await connected();
    provider.balanceChainId = '0xb618';
    await expect(adapter.getNativeBalance()).rejects.toThrow(/not on chain/);
    expect(provider.calls.some((c) => c.method === 'eth_getBalance')).toBe(false);
  });

  it('rejects malformed balances and provider errors (429, timeout) without a fallback value', async () => {
    for (const bad of ['0x', '12', 12, null, '0x-1', '0x00', 'not-hex']) {
      const { adapter, provider } = await connected();
      provider.balance = bad;
      await expect(adapter.getNativeBalance()).rejects.toThrow();
    }
    for (const err of [Object.assign(new Error('429 Too Many Requests'), { code: 429 }), new Error('timeout')]) {
      const { adapter, provider } = await connected();
      provider.balance = err;
      await expect(adapter.getNativeBalance()).rejects.toThrow();
    }
  });

  it('treats wallet rejections (EIP-1193 4001 / 4100) as read errors', async () => {
    for (const code of [4001, 4100]) {
      const { adapter, provider } = await connected();
      provider.balance = Object.assign(new Error(`wallet error ${code}`), { code });
      await expect(adapter.getNativeBalance()).rejects.toThrow();
    }
  });

  it('drops a result when chainChanged fires while eth_getBalance is in flight', async () => {
    const { adapter, provider } = await connected();
    let release!: () => void;
    provider.balanceGate = new Promise<void>((resolve) => { release = resolve; });
    const pending = adapter.getNativeBalance();
    await Promise.resolve();
    await Promise.resolve();
    provider.handlers.get('chainChanged')?.('0x1');
    release();
    await expect(pending).rejects.toThrow(/changed while the balance was loading/);
  });

  it('refuses to read when not CONNECTED on the active chain', async () => {
    const disconnected = new InjectedWalletAdapter(new FakeProvider());
    await expect(disconnected.getNativeBalance()).rejects.toThrow(/Connect a wallet/);

    const provider = new FakeProvider();
    provider.chainId = '0x1';
    const wrong = new InjectedWalletAdapter(provider);
    await wrong.connect();
    expect(wrong.getState()).toBe('UNSUPPORTED_NETWORK');
    provider.calls.length = 0;
    await expect(wrong.getNativeBalance()).rejects.toThrow(/Connect a wallet/);
    expect(provider.calls).toHaveLength(0);
  });

  it('drops a result when the account changes while eth_getBalance is in flight', async () => {
    const { adapter, provider } = await connected();
    let release!: () => void;
    provider.balanceGate = new Promise<void>((resolve) => { release = resolve; });
    const pending = adapter.getNativeBalance();
    await Promise.resolve();
    await Promise.resolve();
    provider.handlers.get('accountsChanged')?.(['0x1111111111111111111111111111111111111111']);
    release();
    await expect(pending).rejects.toThrow(/changed while the balance was loading/);
  });

  it('drops a result when the wallet disconnects while the read is in flight', async () => {
    const { adapter, provider } = await connected();
    let release!: () => void;
    provider.balanceGate = new Promise<void>((resolve) => { release = resolve; });
    const pending = adapter.getNativeBalance();
    await Promise.resolve();
    await adapter.disconnect();
    release();
    await expect(pending).rejects.toThrow(/changed while the balance was loading/);
  });
});

describe('MockWalletAdapter.getNativeBalance (dev fixture)', () => {
  it('returns the fixture flagged as mock, only when connected on the active chain', async () => {
    const adapter = new MockWalletAdapter();
    await expect(adapter.getNativeBalance()).rejects.toThrow();
    await adapter.connect();
    expect(await adapter.getNativeBalance()).toEqual({
      address: ADDRESS,
      chainId: ACTIVE,
      balanceWei: MockWalletAdapter.MOCK_FIXTURE_BALANCE_WEI,
      isMock: true,
    });
    await adapter.switchChain(1);
    await expect(adapter.getNativeBalance()).rejects.toThrow();
  });
});
