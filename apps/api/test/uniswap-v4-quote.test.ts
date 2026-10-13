import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuoteRequest } from '@robex/types';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import {
  RobexAppError,
  feeAdjustedAmountOut,
  keccak256Hex,
  resolveQuoteFreshness,
} from '@robex/core';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error.middleware.js';
import type { QuoteRouterOptions } from '../src/routes/quote.route.js';
import { QuoteService } from '../src/services/quote.service.js';
import {
  UniswapV4ReadOnlyAdapter,
  isDiagnosticLoggingEnabled,
  redactRpcUrl,
  type FutureBlockDiagnosticContext,
  type V4QuotePins,
} from '../src/adapters/uniswap-v4-readonly-adapter.js';
import { JsonRpcReadOnlyProvider, type ReadOnlyRpc } from '../src/providers/read-only-json-rpc.js';
import { ConstantProductSimulationAdapter } from '../src/adapters/constant-product-simulation-adapter.js';
import { MockRpcLiquidityProvider } from '../src/providers/mock-rpc-liquidity-provider.js';

const NOW_MS = 1_700_000_000_000;
const DEV_ON = (): boolean => true;
const BLOCK_TIMESTAMP_SEC = NOW_MS / 1000;
const BLOCK_TIMESTAMP = `0x${BLOCK_TIMESTAMP_SEC.toString(16)}`;
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
  rpcUrl = 'https://mock-rpc.robinhood.example.com';
  amountOut: bigint;
  code = SENTINEL_HEX;
  chainId = '0xb626';
  manager = pins.poolManager;
  revertQuote = false;
  liquidity = LIQUIDITY;
  clockMs = NOW_MS;
  timestamp = BLOCK_TIMESTAMP;
  advanceOnRequestMs = 0;

  constructor(amountOut: bigint) {
    this.amountOut = amountOut;
  }

  async request(method: string, params: readonly unknown[]): Promise<unknown> {
    this.clockMs += this.advanceOnRequestMs;
    this.calls.push({ method, params: [...params] });
    if (method === 'eth_chainId') return this.chainId;
    if (method === 'eth_getBlockByNumber') {
      return { number: BLOCK, hash: BLOCK_HASH, timestamp: this.timestamp };
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
  options: QuoteRouterOptions,
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
    vi.useRealTimers();
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

  it('keeps eth_getBalance out of the quote provider allowlist (Amendment 1 AC-PCT-11)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    await expect(provider.request('eth_getBalance', ['0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B', 'latest'])).rejects.toThrow(/not allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function rpcResponse(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  it('QA F-02: retries once with the same pinned block when the node has not synced it, then succeeds', async () => {
    const bodies: string[] = [];
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      call += 1;
      return call === 1
        ? rpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unsupported block number 132164749' } })
        : rpcResponse({ jsonrpc: '2.0', id: 1, result: '0x6001' });
    }));
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    await expect(provider.request('eth_getCode', ['0xabc', '0x7e0bd8d'])).resolves.toBe('0x6001');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[1] ?? '{}').params).toEqual(['0xabc', '0x7e0bd8d']);
  });

  it('QA F-02: fails closed with a clear message after the single retry, and does not retry other RPC errors', async () => {
    const fetchMock = vi.fn(async () => rpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unsupported block number 132164749' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    const err = await provider.request('eth_call', [{}, '0x10']).catch((e: unknown) => e) as RobexAppError;
    expect(err).toBeInstanceOf(RobexAppError);
    expect(err.details?.reason).toBe('BLOCK_NOT_SYNCED');
    expect(err.message).toBe('The RPC node has not synced the latest block yet. Please refresh the quote.');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const other = vi.fn(async () => rpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'some other failure' } }));
    vi.stubGlobal('fetch', other);
    await expect(provider.request('eth_call', [{}, '0x10'])).rejects.toMatchObject({
      message: 'The network RPC returned an error. Please try again.',
      details: { reason: 'RPC_ERROR' },
    });
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('QA R2-02: waits 250 ms before the single BLOCK_NOT_SYNCED retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const bodies: string[] = [];
    let call = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      call += 1;
      return call === 1
        ? rpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'header not found' } })
        : rpcResponse({ jsonrpc: '2.0', id: 1, result: '0x6001' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    const pending = provider.request('eth_getCode', ['0xabc', '0x7e0bd8d']);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toBe('0x6001');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[1] ?? '{}').params).toEqual(['0xabc', '0x7e0bd8d']);
  });

  it('QA R2-03: does not surface the raw upstream JSON-RPC message', async () => {
    const upstream = 'leaked SECRETKEY in https://user:SECRET@rpc/v2/PATH';
    vi.stubGlobal('fetch', vi.fn(async () => rpcResponse({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: upstream },
    })));
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    const err = await provider.request('eth_call', [{ to: '0xabc', data: '0x' }, 'latest']).catch((e: unknown) => e) as RobexAppError;
    expect(err).toBeInstanceOf(RobexAppError);
    expect(err.message).toBe('The network RPC returned an error. Please try again.');
    expect(err.message).not.toContain('SECRET');
    expect(err.message).not.toContain(upstream);
    expect(JSON.stringify(err.toJSON())).not.toContain('SECRET');
    expect(JSON.stringify(err.toJSON())).not.toContain(upstream);
    expect(err.details).toMatchObject({ reason: 'RPC_ERROR', code: -32000, method: 'eth_call' });
  });

  it('QA F-03: requires an https RPC URL (http only on loopback) and never echoes the URL', () => {
    expect(() => new JsonRpcReadOnlyProvider('http://rpc.example')).toThrow(/must use https/);
    expect(() => new JsonRpcReadOnlyProvider('ftp://rpc.example')).toThrow(/must use https/);
    expect(() => new JsonRpcReadOnlyProvider('http://127.0.0.1:8545')).not.toThrow();
    expect(() => new JsonRpcReadOnlyProvider('https://rpc.testnet.chain.robinhood.com')).not.toThrow();
    for (const bad of ['https://user:SECRETKEY@ bad host/v2/SECRETPATH?key=SECRETQ', 'not a url SECRETQ']) {
      let message = '';
      try {
        new JsonRpcReadOnlyProvider(bad);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/not a valid URL|must use https/);
      expect(message).not.toMatch(/SECRET/);
    }
  });

  it('QA F-03: a fetch failure does not leak the configured URL into the error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to parse URL from https://user:SECRETKEY@rpc.example/v2/SECRETPATH?key=SECRETQ');
    }));
    const provider = new JsonRpcReadOnlyProvider('https://rpc.example');
    const err = await provider.request('eth_chainId', []).catch((e: unknown) => e) as RobexAppError;
    expect(err.details?.reason).toBe('RPC_UNAVAILABLE');
    expect(JSON.stringify(err.toJSON())).not.toMatch(/SECRET/);
  });

  it('QA F-03: unknown server errors are returned as a generic 500 without internal details', () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as unknown as Parameters<typeof errorHandler>[2];
    errorHandler(new Error('boom at https://user:SECRETKEY@rpc.example/v2/SECRETPATH'), {} as never, res, () => undefined);
    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(500);
    const payload = JSON.stringify(json.mock.calls[0]?.[0]);
    expect(payload).toContain('An unexpected server error occurred');
    expect(payload).not.toMatch(/SECRET|boom/);
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
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs);
    const quote = await new QuoteService([adapter]).getBestQuote(request());

    expect(quote.source.type).toBe('UNISWAP_V4');
    expect(quote.expectedAmountOut).toBe(spot.toString());
    expect(quote.minimumAmountOut).toBe((spot * 9950n / 10_000n).toString());
    expect(quote.risk).toBe('normal');
    expect(quote.quotedAt).toBe(NOW_MS);
    expect(quote.blockTimestamp).toBe(String(BLOCK_TIMESTAMP_SEC));
    expect(quote.expiresAt - (quote.quotedAt ?? 0)).toBe(20_000);
    expect(quote.remainingMs).toBe(20_000);
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

  it('rejects a stale block, a future block, and a slow read without simulation', async () => {
    const simulation = new ConstantProductSimulationAdapter(new MockRpcLiquidityProvider());
    const spy = vi.spyOn(simulation, 'getQuote');
    const quoteWith = (rpc: ScriptedRpc) => new QuoteService([
      new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs),
      simulation,
    ]).getBestQuote(request());

    const stale = new ScriptedRpc(spot);
    stale.timestamp = `0x${(BLOCK_TIMESTAMP_SEC - 21).toString(16)}`;
    await expect(quoteWith(stale)).rejects.toMatchObject({
      code: 'QUOTE_ERROR',
      details: { reason: 'STALE_BLOCK' },
    });
    expect(quoterCalls(stale)).toBe(0);

    const future = new ScriptedRpc(spot);
    future.timestamp = `0x${(BLOCK_TIMESTAMP_SEC + 5).toString(16)}`;
    await expect(quoteWith(future)).rejects.toMatchObject({
      details: { reason: 'FUTURE_BLOCK', rejectReason: 'ahead_of_finish' },
    });
    expect(quoterCalls(future)).toBe(0);

    const slow = new ScriptedRpc(spot);
    slow.advanceOnRequestMs = 21_000;
    await expect(quoteWith(slow)).rejects.toMatchObject({
      details: { reason: 'READ_BUDGET' },
    });
    expect(quoterCalls(slow)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects unknown tokens, WETH, the absolute cap, and bad bytecode before or without a quote', async () => {
    const rpc = new ScriptedRpc(spot);
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs);
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
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs);
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

  it('rejects a sub-unit shortfall above 2% and warns below that line', async () => {
    const simulation = new ConstantProductSimulationAdapter(new MockRpcLiquidityProvider());
    const spy = vi.spyOn(simulation, 'getQuote');
    const blockedRpc = new ScriptedRpc(48n);
    const service = new QuoteService([
      new UniswapV4ReadOnlyAdapter(blockedRpc, pins, () => blockedRpc.clockMs),
      simulation,
    ]);
    await expect(service.getBestQuote(request('21825000000'))).rejects.toMatchObject({
      code: 'QUOTE_ERROR',
      details: { reason: 'PRICE_IMPACT', priceImpactPercent: '2.0291' },
    });
    expect(quoterCalls(blockedRpc)).toBe(1);
    expect(spy).not.toHaveBeenCalled();

    const warningRpc = new ScriptedRpc(50n);
    const warning = await new UniswapV4ReadOnlyAdapter(warningRpc, pins, () => warningRpc.clockMs)
      .getQuote(request('22700000000'));
    expect(warning.risk).toBe('warning');
    expect(warning.priceImpactPercentExact).toBe('1.8806');
    expect(warning.expectedAmountOut).toBe('50');
    expect(warning.referenceAmountOut).toBe('50');
  });

  it('serves the live route over HTTP and rejects missing or placeholder inputs', async () => {
    const rpc = new ScriptedRpc(spot);
    await withServer({ rpc, pins, now: () => rpc.clockMs }, async (baseUrl) => {
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
    await withServer({ rpc, now: () => rpc.clockMs }, async (baseUrl) => {
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

  describe('HA14-QA-01 / HA14-QA-03: FUTURE_BLOCK diagnostic logging and redaction', () => {
    it('redacts RPC URLs to valid origins only and suppresses invalid URLs fail-closed', () => {
      // Valid origin tests
      expect(redactRpcUrl('https://rpc.robinhood.com')).toBe('https://rpc.robinhood.com');
      expect(redactRpcUrl('https://rpc.robinhood.com/')).toBe('https://rpc.robinhood.com');
      expect(redactRpcUrl('https://rpc.example.com:8545/v1')).toBe('https://rpc.example.com:8545');
      expect(redactRpcUrl('http://localhost:8545/path')).toBe('http://localhost:8545');
      expect(redactRpcUrl('http://127.0.0.1:8545/rpc')).toBe('http://127.0.0.1:8545');

      // Secrets, userinfo, paths, queries, fragments stripped to origin only
      expect(redactRpcUrl('https://user:pass@rpc.example.com/v1')).toBe('https://rpc.example.com');
      expect(redactRpcUrl('https://rpc.example.com?apiKey=secret-key-123&foo=bar')).toBe('https://rpc.example.com');
      expect(redactRpcUrl('https://rpc.example.com/v2/abcdef1234567890abcdef123456')).toBe('https://rpc.example.com');
      expect(redactRpcUrl('https://rpc.example/v2/QA_SECRET')).toBe('https://rpc.example');
      expect(redactRpcUrl('https://rpc.example/v2/QA.SECRET.12345678901234567890')).toBe('https://rpc.example');
      expect(redactRpcUrl('https://user:pass@rpc.example.com/v2/abcdef1234567890abcdef123456?secret=1')).toBe('https://rpc.example.com');
      expect(redactRpcUrl('https://rpc.example.com/v1?secret=1#fragment-secret')).toBe('https://rpc.example.com');

      // Percent-encoded path tokens
      expect(redactRpcUrl('https://rpc.example/v2/QA%5FSECRET%5F12345678901234567890')).toBe('https://rpc.example');
      expect(redactRpcUrl('https://rpc.example/v1/%2Fapi%2Fkey%3Dsecret')).toBe('https://rpc.example');

      // Malformed / invalid URLs (must return [redacted-invalid-rpc-url] fail-closed)
      expect(redactRpcUrl('https://QA_USER:QA_PASSWORD@[broken-host]/v2/QA_SECRET_12345678901234567890#QA_HASH')).toBe('[redacted-invalid-rpc-url]');
      expect(redactRpcUrl('not-a-valid-url?key=secret')).toBe('[redacted-invalid-rpc-url]');
      expect(redactRpcUrl('javascript:alert(1)')).toBe('[redacted-invalid-rpc-url]');
      expect(redactRpcUrl('data:text/plain;base64,secret')).toBe('[redacted-invalid-rpc-url]');
      expect(redactRpcUrl('file:///etc/shadow')).toBe('[redacted-invalid-rpc-url]');
      expect(redactRpcUrl('ftp://user:pass@example.com')).toBe('[redacted-invalid-rpc-url]');

      // Empty and undefined
      expect(redactRpcUrl('')).toBe('unknown');
      expect(redactRpcUrl('   ')).toBe('unknown');
      expect(redactRpcUrl(undefined)).toBe('unknown');
    });

    it('logs structured diagnostics on pre-pool FUTURE_BLOCK rejection and redacts credentials to origin only', async () => {
      const rpc = new ScriptedRpc(spot);
      rpc.rpcUrl = 'https://user:secret@rpc.sequencer.internal:8545/v1/%2FQA_SECRET%2F123456?token=hidden#frag_secret';
      rpc.timestamp = `0x${(BLOCK_TIMESTAMP_SEC + 5).toString(16)}`;

      let loggedMessage = '';
      let loggedContext: FutureBlockDiagnosticContext | undefined;
      const logger = {
        warn: vi.fn((message: string, context?: unknown) => {
          loggedMessage = message;
          loggedContext = context as FutureBlockDiagnosticContext;
        }),
      };

      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs, logger, undefined, DEV_ON);

      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK', rejectReason: 'ahead_of_finish' },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(loggedMessage).toContain('[UniswapV4ReadOnlyAdapter] FUTURE_BLOCK (pre-pool)');
      expect(loggedMessage).toContain('rejectReason=ahead_of_finish compareAgainst=finishedSec diffSeconds=5');
      expect(loggedMessage).toContain('block #16');
      expect(loggedMessage).toContain('delta=5s');
      expect(loggedMessage).toContain('via rpc=https://rpc.sequencer.internal:8545');
      expect(loggedMessage).not.toContain('user');
      expect(loggedMessage).not.toContain('secret');
      expect(loggedMessage).not.toContain('QA_SECRET');
      expect(loggedMessage).not.toContain('hidden');
      expect(loggedMessage).not.toContain('frag_secret');
      expect(loggedMessage).not.toContain('token');

      expect(loggedContext).toBeDefined();
      expect(loggedContext).toMatchObject({
        phase: 'pre-pool',
        readStartedAtMs: NOW_MS,
        readFinishedAtMs: NOW_MS,
        blockTimestampSeconds: (BLOCK_TIMESTAMP_SEC + 5).toString(),
        blockNumber: '16',
        diffSeconds: 5,
        rejectReason: 'ahead_of_finish',
        compareAgainst: 'finishedSec',
        chainId: 46630,
      });
      expect(loggedContext?.rpcUrl).toBe('https://rpc.sequencer.internal:8545');
    });

    it('logs fail-closed redacted-invalid-rpc-url on pre-pool FUTURE_BLOCK when rpcUrl is malformed', async () => {
      const rpc = new ScriptedRpc(spot);
      rpc.rpcUrl = 'https://QA_USER:QA_PASSWORD@[broken-host]/v2/QA_SECRET#QA_HASH';
      rpc.timestamp = `0x${(BLOCK_TIMESTAMP_SEC + 5).toString(16)}`;

      let loggedMessage = '';
      let loggedContext: FutureBlockDiagnosticContext | undefined;
      const logger = {
        warn: vi.fn((message: string, context?: unknown) => {
          loggedMessage = message;
          loggedContext = context as FutureBlockDiagnosticContext;
        }),
      };

      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs, logger, undefined, DEV_ON);

      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK', rejectReason: 'ahead_of_finish' },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(loggedMessage).toContain('[UniswapV4ReadOnlyAdapter] FUTURE_BLOCK (pre-pool)');
      expect(loggedMessage).toContain('rejectReason=ahead_of_finish compareAgainst=finishedSec diffSeconds=5');
      expect(loggedMessage).toContain('via rpc=[redacted-invalid-rpc-url]');
      expect(loggedMessage).not.toContain('QA_USER');
      expect(loggedMessage).not.toContain('QA_PASSWORD');
      expect(loggedMessage).not.toContain('broken-host');
      expect(loggedMessage).not.toContain('QA_SECRET');
      expect(loggedMessage).not.toContain('QA_HASH');

      expect(loggedContext?.rpcUrl).toBe('[redacted-invalid-rpc-url]');
      expect(loggedContext).toMatchObject({
        rejectReason: 'ahead_of_finish',
        compareAgainst: 'finishedSec',
        diffSeconds: 5,
      });
    });

    it('logs structured diagnostics on post-quote FUTURE_BLOCK rejection and redacts credentials to origin only', async () => {
      const rpc = new ScriptedRpc(spot);
      rpc.rpcUrl = 'https://rpc.sequencer.internal/v2/QA.SECRET.12345678901234567890/QA_SECRET?secret=query_param#hash';

      let loggedMessage = '';
      let loggedContext: FutureBlockDiagnosticContext | undefined;
      const logger = {
        warn: vi.fn((message: string, context?: unknown) => {
          loggedMessage = message;
          loggedContext = context as FutureBlockDiagnosticContext;
        }),
      };

      let calls = 0;
      const mockCheckFreshness = vi.fn((_blockTimestampSeconds: bigint, startedMs: number, _finishedMs: number) => {
        calls += 1;
        if (calls === 1) {
          return { quotedAt: startedMs, expiresAt: startedMs + 20_000 };
        }
        throw new RobexAppError('QUOTE_ERROR', 'The pinned chain block timestamp is ahead of the quote clock. No quote is available.', {
          reason: 'FUTURE_BLOCK',
        });
      });

      const adapter = new UniswapV4ReadOnlyAdapter(
        rpc,
        pins,
        () => rpc.clockMs,
        logger,
        mockCheckFreshness,
        DEV_ON,
      );

      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK' },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(loggedMessage).toContain('[UniswapV4ReadOnlyAdapter] FUTURE_BLOCK (post-quote)');
      expect(loggedMessage).toContain('block #16');
      expect(loggedMessage).toContain('via rpc=https://rpc.sequencer.internal');
      expect(loggedMessage).not.toContain('QA.SECRET');
      expect(loggedMessage).not.toContain('QA_SECRET');
      expect(loggedMessage).not.toContain('query_param');
      expect(loggedMessage).not.toContain('hash');
      expect(loggedMessage).not.toContain('v2');

      expect(loggedContext).toBeDefined();
      expect(loggedContext).toMatchObject({
        phase: 'post-quote',
        readStartedAtMs: NOW_MS,
        readFinishedAtMs: NOW_MS,
        blockNumber: '16',
        chainId: 46630,
        // Thrown details omit rejectReason. Start and finish are the same second
        // as the block, so the adapter classifies the fallback as start skew.
        rejectReason: 'skew_from_start_gt_2',
        compareAgainst: 'startedSec',
        diffSeconds: 0,
      });
      expect(loggedMessage).toContain('rejectReason=skew_from_start_gt_2 compareAgainst=startedSec diffSeconds=0');
      expect(loggedContext?.rpcUrl).toBe('https://rpc.sequencer.internal');
    });

    it('logs fail-closed redacted-invalid-rpc-url on post-quote FUTURE_BLOCK when rpcUrl is malformed', async () => {
      const rpc = new ScriptedRpc(spot);
      rpc.rpcUrl = 'not-a-valid-url?secret=leak_token';

      let loggedMessage = '';
      let loggedContext: FutureBlockDiagnosticContext | undefined;
      const logger = {
        warn: vi.fn((message: string, context?: unknown) => {
          loggedMessage = message;
          loggedContext = context as FutureBlockDiagnosticContext;
        }),
      };

      let calls = 0;
      const mockCheckFreshness = vi.fn((_blockTimestampSeconds: bigint, startedMs: number, _finishedMs: number) => {
        calls += 1;
        if (calls === 1) {
          return { quotedAt: startedMs, expiresAt: startedMs + 20_000 };
        }
        throw new RobexAppError('QUOTE_ERROR', 'The pinned chain block timestamp is ahead of the quote clock. No quote is available.', {
          reason: 'FUTURE_BLOCK',
        });
      });

      const adapter = new UniswapV4ReadOnlyAdapter(
        rpc,
        pins,
        () => rpc.clockMs,
        logger,
        mockCheckFreshness,
        DEV_ON,
      );

      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK' },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(loggedMessage).toContain('[UniswapV4ReadOnlyAdapter] FUTURE_BLOCK (post-quote)');
      expect(loggedMessage).toContain('via rpc=[redacted-invalid-rpc-url]');
      expect(loggedMessage).not.toContain('not-a-valid-url');
      expect(loggedMessage).not.toContain('secret');
      expect(loggedMessage).not.toContain('leak_token');

      expect(loggedContext?.rpcUrl).toBe('[redacted-invalid-rpc-url]');
      expect(loggedContext).toMatchObject({
        rejectReason: 'skew_from_start_gt_2',
        compareAgainst: 'startedSec',
        diffSeconds: 0,
      });
    });

    it('preserves the genuine connection URL on JsonRpcReadOnlyProvider while redacting in FUTURE_BLOCK diagnostics', async () => {
      const realSecretUrl = 'https://user:super_secret@rpc.sequencer.internal:8545/v2/my_secret_token?key=abc';
      const provider = new JsonRpcReadOnlyProvider(realSecretUrl);
      expect(provider.rpcUrl).toBe(realSecretUrl);

      const requestedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrls.push(String(input));
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0xb626' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (body.method === 'eth_getBlockByNumber') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { number: BLOCK, hash: BLOCK_HASH, timestamp: `0x${(BLOCK_TIMESTAMP_SEC + 5).toString(16)}` },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'unsupported' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      });

      try {
        let loggedMessage = '';
        let loggedContext: FutureBlockDiagnosticContext | undefined;
        const logger = {
          warn: vi.fn((message: string, context?: unknown) => {
            loggedMessage = message;
            loggedContext = context as FutureBlockDiagnosticContext;
          }),
        };

        const adapter = new UniswapV4ReadOnlyAdapter(provider, pins, () => NOW_MS, logger, undefined, DEV_ON);

        await expect(adapter.getQuote(request())).rejects.toMatchObject({
          details: { reason: 'FUTURE_BLOCK' },
        });

        // Genuine fetch URL was used for connection
        expect(requestedUrls.length).toBeGreaterThanOrEqual(1);
        expect(requestedUrls.every((url) => url === realSecretUrl)).toBe(true);

        // Diagnostics only exposed origin
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(loggedMessage).toContain('via rpc=https://rpc.sequencer.internal:8545');
        expect(loggedMessage).not.toContain('super_secret');
        expect(loggedMessage).not.toContain('my_secret_token');
        expect(loggedMessage).not.toContain('key=abc');
        expect(loggedContext?.rpcUrl).toBe('https://rpc.sequencer.internal:8545');
        expect(loggedContext).toMatchObject({
          rejectReason: 'ahead_of_finish',
          compareAgainst: 'finishedSec',
          diffSeconds: 5,
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  it('QA F-15: reports remainingMs measured when the read finished, not from the block alone', async () => {
    const rpc = new ScriptedRpc(spot);
    rpc.clockMs = NOW_MS + 600; // still inside the block second
    rpc.advanceOnRequestMs = 25; // each RPC read takes 25 ms
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs);
    const quote = await adapter.getQuote(request());
    expect(quote.expiresAt).toBe(NOW_MS + 20_000);
    expect(quote.remainingMs).toBe(quote.expiresAt - rpc.clockMs);
    expect(quote.remainingMs).toBeLessThan(20_000 - 600);
    expect(quote.remainingMs).toBeGreaterThan(0);
  });

  it('has no backend balance route (Amendment 1 D8, AC-PCT-11)', async () => {
    const rpc = new ScriptedRpc(spot);
    await withServer({ rpc, pins, now: () => rpc.clockMs }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/balance?chainId=46630&address=0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B`);
      expect(res.status).toBe(404);
    });
    expect(rpc.calls).toHaveLength(0);
  });

  describe('FUTURE_BLOCK diagnostics are development only (Amendment 1 D2, AC-FB-05)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const futureTimestamp = `0x${(BLOCK_TIMESTAMP_SEC + 1).toString(16)}`;

    function postQuoteFutureFreshness() {
      let calls = 0;
      return vi.fn((_blockTimestampSeconds: bigint, startedMs: number, _finishedMs: number) => {
        calls += 1;
        if (calls === 1) return { quotedAt: startedMs, expiresAt: startedMs + 20_000 };
        throw new RobexAppError('QUOTE_ERROR', 'The pinned chain block timestamp is ahead of the quote clock. No quote is available.', {
          reason: 'FUTURE_BLOCK',
        });
      });
    }

    async function runPhase(phase: 'pre-pool' | 'post-quote', env: Record<string, string | undefined>) {
      const rpc = new ScriptedRpc(spot);
      if (phase === 'pre-pool') rpc.timestamp = futureTimestamp;
      const logger = { warn: vi.fn() };
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const adapter = new UniswapV4ReadOnlyAdapter(
        rpc,
        pins,
        () => rpc.clockMs,
        logger,
        phase === 'post-quote' ? postQuoteFutureFreshness() : undefined,
        () => isDiagnosticLoggingEnabled(env),
      );
      const error = await adapter.getQuote(request()).then(
        () => { throw new Error('expected FUTURE_BLOCK'); },
        (err: unknown) => err,
      );
      const result = {
        error: error as RobexAppError,
        loggerCalls: logger.warn.mock.calls.length,
        consoleCalls: consoleWarn.mock.calls.length,
        quoterCalls: quoterCalls(rpc),
        loggedPhase: (logger.warn.mock.calls[0]?.[1] as FutureBlockDiagnosticContext | undefined)?.phase,
        logged: logger.warn.mock.calls[0]?.[1] as FutureBlockDiagnosticContext | undefined,
      };
      consoleWarn.mockRestore();
      return result;
    }

    it('enables diagnostics only for NODE_ENV=development', () => {
      expect(isDiagnosticLoggingEnabled({ NODE_ENV: 'development' })).toBe(true);
      for (const value of ['production', 'test', undefined, '', 'Development', 'dev', 'staging', ' development']) {
        expect(isDiagnosticLoggingEnabled({ NODE_ENV: value })).toBe(false);
      }
      expect(isDiagnosticLoggingEnabled({})).toBe(false);
    });

    const silentEnvs: [string, Record<string, string | undefined>][] = [
      ['production', { NODE_ENV: 'production' }],
      ['test', { NODE_ENV: 'test' }],
      ['unset', {}],
      ['an unknown value', { NODE_ENV: 'staging' }],
    ];

    for (const phase of ['pre-pool', 'post-quote'] as const) {
      for (const [label, env] of silentEnvs) {
        it(`does not log ${phase} FUTURE_BLOCK when NODE_ENV is ${label}, and still rejects the quote`, async () => {
          const result = await runPhase(phase, env);
          expect(result.error).toBeInstanceOf(RobexAppError);
          expect(result.error.code).toBe('QUOTE_ERROR');
          expect(result.error.details?.reason).toBe('FUTURE_BLOCK');
          expect(result.loggerCalls).toBe(0);
          expect(result.consoleCalls).toBe(0);
          expect(result.quoterCalls).toBe(phase === 'pre-pool' ? 0 : 1);
        });
      }

      it(`logs ${phase} FUTURE_BLOCK exactly once when NODE_ENV is development`, async () => {
        const result = await runPhase(phase, { NODE_ENV: 'development' });
        expect(result.error.code).toBe('QUOTE_ERROR');
        expect(result.error.details?.reason).toBe('FUTURE_BLOCK');
        expect(result.loggerCalls).toBe(1);
        expect(result.loggedPhase).toBe(phase);
        expect(result.quoterCalls).toBe(phase === 'pre-pool' ? 0 : 1);
        if (phase === 'pre-pool') {
          expect(result.error.details?.rejectReason).toBe('ahead_of_finish');
          expect(result.logged).toMatchObject({
            rejectReason: 'ahead_of_finish',
            compareAgainst: 'finishedSec',
            diffSeconds: 1,
          });
        } else {
          expect(result.logged).toMatchObject({
            rejectReason: 'skew_from_start_gt_2',
            compareAgainst: 'startedSec',
            diffSeconds: 0,
          });
        }
      });
    }

    it('logs the literal AC-FB-01 case (start …999, block +1, finish the same ms) as ahead_of_finish with diffSeconds = 1', async () => {
      // Finish stays in the start second, so blockSec > finishedSec. This is not the allowed AC-FB-09 cross-second read.
      const rpc = new ScriptedRpc(spot);
      rpc.clockMs = NOW_MS + 999;
      rpc.timestamp = futureTimestamp;
      const logger = { warn: vi.fn() };
      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs, logger, undefined, DEV_ON);
      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK', rejectReason: 'ahead_of_finish' },
      });
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(String(logger.warn.mock.calls[0]?.[0])).toContain(
        'rejectReason=ahead_of_finish compareAgainst=finishedSec diffSeconds=1',
      );
      expect(logger.warn.mock.calls[0]?.[1]).toMatchObject({
        phase: 'pre-pool',
        readStartedAtMs: NOW_MS + 999,
        readFinishedAtMs: NOW_MS + 999,
        blockTimestampSeconds: String(BLOCK_TIMESTAMP_SEC + 1),
        blockNumber: '16',
        diffSeconds: 1,
        rejectReason: 'ahead_of_finish',
        compareAgainst: 'finishedSec',
        chainId: 46630,
      });
      expect(quoterCalls(rpc)).toBe(0);
    });

    it('stays silent through the default console logger when nothing is injected (vitest runs with NODE_ENV=test)', async () => {
      expect(process.env.NODE_ENV).not.toBe('development');
      const rpc = new ScriptedRpc(spot);
      rpc.timestamp = futureTimestamp;
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs);
      await expect(adapter.getQuote(request())).rejects.toMatchObject({ details: { reason: 'FUTURE_BLOCK' } });
      expect(consoleWarn).not.toHaveBeenCalled();
    });

    it('returns the same HTTP 400 FUTURE_BLOCK over the route with diagnostics on or off', async () => {
      for (const enabled of [false, true]) {
        const rpc = new ScriptedRpc(spot);
        rpc.timestamp = futureTimestamp;
        const logger = { warn: vi.fn() };
        await withServer({ rpc, pins, now: () => rpc.clockMs, logger, diagnosticsEnabled: () => enabled }, async (baseUrl) => {
          const params = new URLSearchParams({
            tokenIn: pins.nativeEth,
            tokenOut: pins.usdg,
            amountIn: AMOUNT.toString(),
            slippage: '0.5',
            chainId: '46630',
          });
          const res = await fetch(`${baseUrl}/api/v1/quote?${params.toString()}`);
          const body = await res.json() as { quote?: unknown; error?: { code?: string; details?: { reason?: string; rejectReason?: string } } };
          expect(res.status).toBe(400);
          expect(body.quote).toBeUndefined();
          expect(body.error?.code).toBe('QUOTE_ERROR');
          expect(body.error?.details?.reason).toBe('FUTURE_BLOCK');
          expect(body.error?.details?.rejectReason).toBe('ahead_of_finish');
        });
        expect(logger.warn).toHaveBeenCalledTimes(enabled ? 1 : 0);
      }
    });
  });

  describe('AC-FB-13: FUTURE_BLOCK logs name rejectReason and compareAgainst', () => {
    const secretRpc = 'https://user:secret@mock-rpc.robinhood.example.com/v1/QA_SECRET?token=hidden';

    async function runCase(
      phase: 'pre-pool' | 'post-quote',
      reason: 'ahead_of_finish' | 'skew_from_start_gt_2',
      dev: boolean,
    ) {
      const rpc = new ScriptedRpc(spot);
      rpc.rpcUrl = secretRpc;
      const blockSec = reason === 'skew_from_start_gt_2' ? 21 : 5;
      const startMs = reason === 'skew_from_start_gt_2' ? 1001 : 4000;
      const finishMs = reason === 'skew_from_start_gt_2' ? 21_000 : 4500;
      rpc.timestamp = `0x${blockSec.toString(16)}`;
      const times = phase === 'pre-pool' ? [startMs, finishMs] : [startMs, startMs, finishMs];
      let tick = 0;
      const now = () => times[Math.min(tick++, times.length - 1)] ?? startMs;
      let checks = 0;
      const checkFreshness = phase === 'post-quote'
        ? (blockTimestampSeconds: bigint, readStartedAtMs: number, readFinishedAtMs: number) => {
          checks += 1;
          if (checks === 1) {
            const quotedAt = Number(blockTimestampSeconds) * 1000;
            return { quotedAt, expiresAt: quotedAt + 20_000 };
          }
          return resolveQuoteFreshness(blockTimestampSeconds, readStartedAtMs, readFinishedAtMs);
        }
        : undefined;
      const logger = { warn: vi.fn() };
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, now, logger, checkFreshness, () => dev);
      try {
        const error = await adapter.getQuote(request()).then(
          () => { throw new Error('expected FUTURE_BLOCK'); },
          (err: unknown) => err,
        ) as RobexAppError;
        const message = String(logger.warn.mock.calls[0]?.[0] ?? '');
        const context = logger.warn.mock.calls[0]?.[1] as FutureBlockDiagnosticContext | undefined;
        return {
          error,
          message,
          context,
          loggerCalls: logger.warn.mock.calls.length,
          consoleCalls: consoleWarn.mock.calls.length,
          quoterCalls: quoterCalls(rpc),
          expected: {
            phase,
            rejectReason: reason,
            compareAgainst: reason === 'ahead_of_finish' ? 'finishedSec' as const : 'startedSec' as const,
            diffSeconds: reason === 'ahead_of_finish' ? 1 : 20,
            readStartedAtMs: startMs,
            readFinishedAtMs: finishMs,
            blockTimestampSeconds: String(blockSec),
            blockNumber: '16',
            chainId: 46630,
            rpcUrl: 'https://mock-rpc.robinhood.example.com',
          },
        };
      } finally {
        consoleWarn.mockRestore();
      }
    }

    for (const phase of ['pre-pool', 'post-quote'] as const) {
      for (const reason of ['ahead_of_finish', 'skew_from_start_gt_2'] as const) {
        it(`logs ${phase} ${reason} once in development and stays silent when diagnostics are off`, async () => {
          const on = await runCase(phase, reason, true);
          expect(on.error).toBeInstanceOf(RobexAppError);
          expect(on.error.details).toMatchObject({ reason: 'FUTURE_BLOCK', rejectReason: reason });
          expect(on.loggerCalls).toBe(1);
          expect(on.consoleCalls).toBe(0);
          expect(on.quoterCalls).toBe(phase === 'pre-pool' ? 0 : 1);
          expect(on.message).toContain(
            `FUTURE_BLOCK (${phase}): rejectReason=${reason} compareAgainst=${on.expected.compareAgainst} diffSeconds=${on.expected.diffSeconds}`,
          );
          expect(on.message).toContain('via rpc=https://mock-rpc.robinhood.example.com');
          expect(on.message).not.toContain('user:secret');
          expect(on.message).not.toContain('QA_SECRET');
          expect(on.message).not.toContain('hidden');
          expect(on.context).toMatchObject(on.expected);

          const off = await runCase(phase, reason, false);
          expect(off.error.details).toMatchObject({ reason: 'FUTURE_BLOCK', rejectReason: reason });
          expect(off.loggerCalls).toBe(0);
          expect(off.consoleCalls).toBe(0);
          expect(off.quoterCalls).toBe(phase === 'pre-pool' ? 0 : 1);
        });
      }
    }
  });
});

const ABSOLUTE_OVER_CAP = '100000000000001';
