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
import {
  UniswapV4ReadOnlyAdapter,
  redactRpcUrl,
  type FutureBlockDiagnosticContext,
  type V4QuotePins,
} from '../src/adapters/uniswap-v4-readonly-adapter.js';
import { JsonRpcReadOnlyProvider, type ReadOnlyRpc } from '../src/providers/read-only-json-rpc.js';
import { ConstantProductSimulationAdapter } from '../src/adapters/constant-product-simulation-adapter.js';
import { MockRpcLiquidityProvider } from '../src/providers/mock-rpc-liquidity-provider.js';

const NOW_MS = 1_700_000_000_000;
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
    const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs);
    const quote = await new QuoteService([adapter]).getBestQuote(request());

    expect(quote.source.type).toBe('UNISWAP_V4');
    expect(quote.expectedAmountOut).toBe(spot.toString());
    expect(quote.minimumAmountOut).toBe((spot * 9950n / 10_000n).toString());
    expect(quote.risk).toBe('normal');
    expect(quote.quotedAt).toBe(NOW_MS);
    expect(quote.blockTimestamp).toBe(String(BLOCK_TIMESTAMP_SEC));
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
      details: { reason: 'FUTURE_BLOCK' },
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

      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs, logger);

      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK' },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(loggedMessage).toContain('[UniswapV4ReadOnlyAdapter] FUTURE_BLOCK (pre-pool)');
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

      const adapter = new UniswapV4ReadOnlyAdapter(rpc, pins, () => rpc.clockMs, logger);

      await expect(adapter.getQuote(request())).rejects.toMatchObject({
        details: { reason: 'FUTURE_BLOCK' },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(loggedMessage).toContain('[UniswapV4ReadOnlyAdapter] FUTURE_BLOCK (pre-pool)');
      expect(loggedMessage).toContain('via rpc=[redacted-invalid-rpc-url]');
      expect(loggedMessage).not.toContain('QA_USER');
      expect(loggedMessage).not.toContain('QA_PASSWORD');
      expect(loggedMessage).not.toContain('broken-host');
      expect(loggedMessage).not.toContain('QA_SECRET');
      expect(loggedMessage).not.toContain('QA_HASH');

      expect(loggedContext?.rpcUrl).toBe('[redacted-invalid-rpc-url]');
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
      });
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

        const adapter = new UniswapV4ReadOnlyAdapter(provider, pins, () => NOW_MS, logger);

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
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

const ABSOLUTE_OVER_CAP = '100000000000001';
