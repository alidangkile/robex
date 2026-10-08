import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuoteRequest } from '@robex/types';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import {
  RobexAppError,
  feeAdjustedAmountOut,
  keccak256Hex,
} from '@robex/core';
import { createApp } from '../src/app.js';
import { QuoteService } from '../src/services/quote.service.js';
import { UniswapV4ReadOnlyAdapter, type V4QuotePins } from '../src/adapters/uniswap-v4-readonly-adapter.js';
import { JsonRpcReadOnlyProvider, type ReadOnlyRpc } from '../src/providers/read-only-json-rpc.js';
import { ConstantProductSimulationAdapter } from '../src/adapters/constant-product-simulation-adapter.js';
import { MockRpcLiquidityProvider } from '../src/providers/mock-rpc-liquidity-provider.js';

const SQRT = 3759471235661676040702346n;
const TICK = -199127n;
const LIQUIDITY = 103923048454n;
const AMOUNT = 500_000_000_000n;
const BLOCK = '0x10';
const BLOCK_HASH = `0x${'11'.repeat(32)}`;
const SENTINEL = Uint8Array.from([0x60, 0x01]);
const SENTINEL_HEX = '0x6001';
const SENTINEL_HASH = keccak256Hex(SENTINEL);

const pins: V4QuotePins = {
  ...UNISWAP_V4_TESTNET_QUOTE,
  code: {
    poolManager: { bytes: SENTINEL.length, keccak256: SENTINEL_HASH },
    stateView: { bytes: SENTINEL.length, keccak256: SENTINEL_HASH },
    v4Quoter: { bytes: SENTINEL.length, keccak256: SENTINEL_HASH },
    usdg: { bytes: SENTINEL.length, keccak256: SENTINEL_HASH },
  },
};

function word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function request(amount = AMOUNT.toString()): QuoteRequest {
  return {
    chainId: 46630,
    tokenIn: pins.nativeEth,
    tokenOut: pins.usdg,
    amountIn: amount,
    slippageBps: 50,
    slippageTolerancePercent: 0.5,
  };
}

class ScriptedRpc implements ReadOnlyRpc {
  readonly calls: { method: string; params: unknown[] }[] = [];
  amountOut: bigint;
  code = SENTINEL_HEX;
  chainId = '0xb626';
  manager = pins.poolManager;
  revertQuote = false;
  liquidity = LIQUIDITY;

  constructor(amountOut: bigint) {
    this.amountOut = amountOut;
  }

  async request(method: string, params: readonly unknown[]): Promise<unknown> {
    this.calls.push({ method, params: [...params] });
    if (method === 'eth_chainId') return this.chainId;
    if (method === 'eth_getBlockByNumber') {
      return { number: BLOCK, hash: BLOCK_HASH, timestamp: '0x65' };
    }
    const tag = params[1];
    if (tag !== BLOCK) throw new Error(`read used block tag ${String(tag)}`);
    if (method === 'eth_getCode') return this.code;
    if (method === 'eth_call') {
      const data = String((params[0] as { data?: string }).data);
      if (data.startsWith('0xdc4c90d3')) return `0x${word(BigInt(this.manager))}`;
      if (data.startsWith('0x313ce567')) return `0x${word(6n)}`;
      if (data.startsWith('0xc815641c')) return `0x${word(SQRT)}${word(TICK < 0n ? (1n << 256n) + TICK : TICK)}${word(0n)}${word(3000n)}`;
      if (data.startsWith('0xfa6793d5')) return `0x${word(this.liquidity)}`;
      if (data.startsWith('0xaa9d21cb')) {
        if (this.revertQuote) {
          throw new RobexAppError('PROVIDER_ERROR', 'RPC error: execution reverted', { reason: 'RPC_REVERT' });
        }
        return `0x${word(this.amountOut)}${word(1n)}`;
      }
    }
    throw new Error(`unexpected RPC ${method}`);
  }
}

function quoterCalls(rpc: ScriptedRpc): number {
  return rpc.calls.filter((call) => call.method === 'eth_call'
    && String((call.params[0] as { data?: string }).data).startsWith('0xaa9d21cb')).length;
}

async function withServer(
  options: { rpc?: ReadOnlyRpc; pins?: V4QuotePins; now?: () => number },
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = createApp(options);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('read-only JSON-RPC provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects transaction methods before any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    await expect(provider.request('eth_sendTransaction', [])).rejects.toThrow(/read-only/);
    await expect(provider.request('eth_sendRawTransaction', [])).rejects.toThrow(/read-only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps HTTP 429 and timeouts to explicit provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    await expect(provider.request('eth_chainId', [])).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      details: { reason: 'RATE_LIMIT' },
    });

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }));
    await expect(provider.request('eth_chainId', [])).rejects.toMatchObject({
      details: { reason: 'TIMEOUT' },
    });
  });
});

describe('Uniswap v4 read-only quote', () => {
  const spot = feeAdjustedAmountOut(AMOUNT, SQRT, 3000n);

  it('returns one live quote from a consistent block and omits execution fields', async () => {
    const rpc = new ScriptedRpc(spot);
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => 1_700_000_000_000);
    const quote = await new QuoteService([adapter]).getBestQuote(request());

    expect(quote.source.type).toBe('UNISWAP_V4');
    expect(quote.expectedAmountOut).toBe(spot.toString());
    expect(quote.minimumAmountOut).toBe((spot * 9950n / 10_000n).toString());
    expect(quote.risk).toBe('normal');
    expect(quote.expiresAt - (quote.quotedAt ?? 0)).toBe(20_000);
    expect(quote.blockNumber).toBe('16');
    expect(quote.blockHash).toBe(BLOCK_HASH);
    expect(quote.poolId).toBe(pins.poolId);
    expect((quote as unknown as { rawCalldata?: unknown }).rawCalldata).toBeUndefined();
    expect((quote as unknown as { estimatedGas?: unknown }).estimatedGas).toBeUndefined();
    expect((quote as unknown as { gasEstimate?: unknown }).gasEstimate).toBeUndefined();
    expect(rpc.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
    expect(rpc.calls.filter((call) => call.method === 'eth_call' || call.method === 'eth_getCode').every((call) => call.params.at(-1) === BLOCK)).toBe(true);
    expect(quoterCalls(rpc)).toBe(1);
  });

  it('does not fall back to the simulation adapter when the live read fails', async () => {
    const rpc = new ScriptedRpc(spot);
    rpc.chainId = '0x1';
    const simulation = new ConstantProductSimulationAdapter(new MockRpcLiquidityProvider());
    const spy = vi.spyOn(simulation, 'getQuote');
    const service = new QuoteService([new UniswapV4ReadOnlyAdapter(rpc, pins), simulation]);
    await expect(service.getBestQuote(request())).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      details: { reason: 'CHAIN_MISMATCH' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects unknown tokens, WETH, the absolute cap, and bad bytecode before or without a quote', async () => {
    const rpc = new ScriptedRpc(spot);
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins);
    await expect(adapter.getQuote({ ...request(), tokenOut: '0x1111111111111111111111111111111111111111' })).rejects.toMatchObject({
      details: { reason: 'TOKEN_NOT_ALLOWED' },
    });
    await expect(adapter.getQuote({ ...request(), tokenIn: pins.weth })).rejects.toMatchObject({
      details: { reason: 'WETH_NOT_QUOTABLE' },
    });
    await expect(adapter.getQuote(request(ABSOLUTE_OVER_CAP))).rejects.toMatchObject({
      details: { reason: 'ABSOLUTE_CAP' },
    });
    expect(rpc.calls).toHaveLength(0);

    rpc.code = '0x';
    await expect(adapter.getQuote(request())).rejects.toMatchObject({ details: { reason: 'MISSING_BYTECODE' } });
    rpc.code = '0x6000';
    await expect(adapter.getQuote(request())).rejects.toMatchObject({ details: { reason: 'BYTECODE_MISMATCH' } });
    rpc.code = SENTINEL_HEX;
    rpc.manager = '0x0000000000000000000000000000000000000009';
    await expect(adapter.getQuote(request())).rejects.toMatchObject({ details: { reason: 'LINKAGE_MISMATCH' } });
    rpc.manager = pins.poolManager;
    rpc.liquidity = 0n;
    await expect(adapter.getQuote(request())).rejects.toMatchObject({ details: { reason: 'NO_LIQUIDITY' } });
    rpc.liquidity = LIQUIDITY;
    rpc.revertQuote = true;
    await expect(adapter.getQuote(request())).rejects.toMatchObject({ details: { reason: 'QUOTER_REVERTED' } });
  });

  it('blocks the dynamic range cap before calling the quoter and blocks impact above 2%', async () => {
    const rpc = new ScriptedRpc(1n);
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins);
    await expect(adapter.getQuote(request('759572282609'))).rejects.toMatchObject({
      details: { reason: 'RANGE_CAP' },
    });
    expect(quoterCalls(rpc)).toBe(0);

    rpc.calls.length = 0;
    rpc.amountOut = 1n;
    await expect(adapter.getQuote(request())).rejects.toMatchObject({
      code: 'QUOTE_ERROR',
      details: { reason: 'PRICE_IMPACT' },
    });
    expect(quoterCalls(rpc)).toBe(1);

    const warningOut = spot - (spot * 150n / 10_000n);
    rpc.amountOut = warningOut;
    const warning = await adapter.getQuote(request());
    expect(warning.risk).toBe('warning');
    expect(warning.expectedAmountOut).toBe(warningOut.toString());
  });

  it('serves the live route over HTTP and rejects missing or placeholder inputs', async () => {
    const rpc = new ScriptedRpc(spot);
    await withServer({ rpc, pins, now: () => 1_700_000_000_000 }, async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/api/v1/quote`);
      expect(missing.status).toBe(400);
      expect(rpc.calls).toHaveLength(0);

      const network = await fetch(`${baseUrl}/api/v1/network`);
      const networkBody = await network.json() as { network: { chainId: number; rpcUrl?: string } };
      expect(networkBody.network.chainId).toBe(46630);
      expect(networkBody.network.rpcUrl).toBeUndefined();

      const params = new URLSearchParams({
        tokenIn: pins.nativeEth,
        tokenOut: pins.usdg,
        amountIn: AMOUNT.toString(),
        slippage: '0.50',
        chainId: '46630',
      });
      const response = await fetch(`${baseUrl}/api/v1/quote?${params.toString()}`);
      const body = await response.json() as { quote: { source: { type: string }; expectedAmountOut: string; expiresAt: number; quotedAt: number } };
      expect(response.status).toBe(200);
      expect(body.quote.source.type).toBe('UNISWAP_V4');
      expect(body.quote.expectedAmountOut).toBe(spot.toString());
      expect(body.quote.expiresAt - body.quote.quotedAt).toBe(20_000);
      expect(JSON.stringify(body)).not.toContain('estimatedGas');
      expect(JSON.stringify(body)).not.toContain('rawCalldata');
      expect(JSON.stringify(body)).not.toContain('gasEstimate');
    });
  });

  it('keeps the production bytecode pin in front of a lookalike contract', async () => {
    const rpc = new ScriptedRpc(spot);
    await withServer({ rpc }, async (baseUrl) => {
      const params = new URLSearchParams({
        tokenIn: pins.nativeEth,
        tokenOut: pins.usdg,
        amountIn: AMOUNT.toString(),
      });
      const response = await fetch(`${baseUrl}/api/v1/quote?${params.toString()}`);
      const body = await response.json() as { quote?: unknown; error?: { details?: { reason?: string } } };
      expect(response.status).toBe(500);
      expect(body.quote).toBeUndefined();
      expect(body.error?.details?.reason).toBe('BYTECODE_MISMATCH');
    });
  });
});

const ABSOLUTE_OVER_CAP = '100000000000001';
