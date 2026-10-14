import { describe, expect, it } from 'vitest';
import { getActiveNetworkConfig, UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { USDG_FORMAT_CONFIG } from '@robex/core';
import { InjectedWalletAdapter } from '../src/wallet/injected-wallet-adapter.js';
import { MockWalletAdapter } from '../src/wallet/mock-wallet-adapter.js';

const ADDRESS = '0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B';
const ACTIVE = getActiveNetworkConfig().chainId;

class FakeProvider {
  calls: { method: string; params?: unknown }[] = [];
  chainId = `0x${ACTIVE.toString(16)}`;
  watchAssetResult: unknown = true;
  handlers = new Map<string, (...args: unknown[]) => void>();

  async request(args: { method: string; params?: unknown }): Promise<unknown> {
    this.calls.push({ method: args.method, params: args.params });
    if (args.method === 'eth_requestAccounts') return [ADDRESS];
    if (args.method === 'eth_chainId') return this.chainId;
    if (args.method === 'wallet_watchAsset') {
      if (this.watchAssetResult instanceof Error) throw this.watchAssetResult;
      return this.watchAssetResult;
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
  provider.calls.length = 0;
  return { adapter, provider };
}

describe('InjectedWalletAdapter.watchUsdgAsset', () => {
  it('sends exact wallet_watchAsset payload deep-equal to imported config and core format values', async () => {
    const { adapter, provider } = await connected();
    const result = await adapter.watchUsdgAsset();

    expect(result).toBe('added');
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0]?.method).toBe('eth_chainId');
    expect(provider.calls[1]?.method).toBe('wallet_watchAsset');

    const expectedPayload = {
      type: 'ERC20',
      options: {
        address: UNISWAP_V4_TESTNET_QUOTE.usdg,
        symbol: USDG_FORMAT_CONFIG.symbol,
        decimals: USDG_FORMAT_CONFIG.decimals,
      },
    };
    expect(provider.calls[1]?.params).toEqual(expectedPayload);
    // Explicit assertion on the canonical values
    expect(USDG_FORMAT_CONFIG.symbol).toBe('USDG');
    expect(USDG_FORMAT_CONFIG.decimals).toBe(6);
    expect(UNISWAP_V4_TESTNET_QUOTE.usdg).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('returns wrong-network without calling wallet_watchAsset when provider reports wrong chain', async () => {
    const { adapter, provider } = await connected();
    provider.chainId = '0x1'; // Ethereum Mainnet

    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('wrong-network');

    expect(provider.calls.some((c) => c.method === 'wallet_watchAsset')).toBe(false);
  });

  it('maps result true to added', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = true;
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('added');
  });

  it('maps result false to declined', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = false;
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('declined');
  });

  it('maps error code 4001 to declined', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = Object.assign(new Error('User rejected the request'), { code: 4001 });
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('declined');
  });

  it('maps error code -32601 to unsupported', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = Object.assign(new Error('The method does not exist / is not available.'), { code: -32601 });
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('unsupported');
  });

  it('maps error code 4200 to unsupported', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = Object.assign(new Error('Provider does not support this method.'), { code: 4200 });
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('unsupported');
  });

  it('maps error message "method not found" to unsupported', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = new Error('RPC error: Method not found');
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('unsupported');
  });

  it('maps error message "not supported" to unsupported', async () => {
    const { adapter, provider } = await connected();
    provider.watchAssetResult = new Error('wallet_watchAsset is not supported on this wallet');
    const result = await adapter.watchUsdgAsset();
    expect(result).toBe('unsupported');
  });

  it('rethrows any other error', async () => {
    const { adapter, provider } = await connected();
    const otherError = Object.assign(new Error('Internal RPC failure'), { code: -32000 });
    provider.watchAssetResult = otherError;
    await expect(adapter.watchUsdgAsset()).rejects.toThrow('Internal RPC failure');
  });

  it('throws when not connected', async () => {
    const provider = new FakeProvider();
    const adapter = new InjectedWalletAdapter(provider);
    await expect(adapter.watchUsdgAsset()).rejects.toThrow();
    expect(provider.calls).toHaveLength(0);
  });
});

describe('MockWalletAdapter.watchUsdgAsset', () => {
  it('returns added when connected on testnet', async () => {
    const mock = new MockWalletAdapter();
    await mock.connect();
    const result = await mock.watchUsdgAsset();
    expect(result).toBe('added');
  });

  it('throws when not connected', async () => {
    const mock = new MockWalletAdapter();
    await expect(mock.watchUsdgAsset()).rejects.toThrow();
  });
});
