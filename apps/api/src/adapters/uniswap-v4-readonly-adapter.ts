import type { Quote, QuoteRequest, RouteSource } from '@robex/types';
import { getActiveNetworkConfig, UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import {
  ABSOLUTE_ETH_CAP_WEI,
  QUOTE_ESTIMATE_NOTICE,
  QUOTER_VERIFICATION_NOTICE,
  RobexAppError,
  SELECTOR,
  USDG_VALUE_NOTICE,
  assessPool,
  assertRationalImpactAllowsQuote,
  bytesToHex,
  computePoolId,
  decodeAddress,
  decodeSignedWord,
  decodeWord,
  encodeQuoteExactInputSingle,
  encodeWordCall,
  feeAdjustedRatio,
  hexToBytes,
  keccak256Hex,
  minimumAmountOut,
  resolveQuoteFreshness,
  resolveSlippageBps,
  type PoolAssessment,
} from '@robex/core';
import type { LiquidityAdapter } from './liquidity-adapter.interface.js';
import type { ReadOnlyRpc } from '../providers/read-only-json-rpc.js';

export interface V4CodePin {
  bytes: number;
  keccak256: string;
}

export interface V4QuotePins {
  chainId: number;
  nativeEth: string;
  usdg: string;
  weth: string;
  poolManager: string;
  stateView: string;
  v4Quoter: string;
  poolId: string;
  feePips: number;
  tickSpacing: number;
  hooks: string;
  code: {
    poolManager: V4CodePin;
    stateView: V4CodePin;
    v4Quoter: V4CodePin;
    usdg: V4CodePin;
  };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function sameAddress(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function requireHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new RobexAppError('PROVIDER_ERROR', `RPC ${label} was not hex.`, { reason: 'BAD_RPC_RESPONSE' });
  }
  return value;
}

function assertCode(label: string, value: unknown, expected: V4CodePin): void {
  if (value === '0x' || value === '0x0') {
    throw new RobexAppError('PROVIDER_ERROR', `${label} has no bytecode at the quoted block.`, {
      reason: 'MISSING_BYTECODE',
      contract: label,
    });
  }
  const hex = requireHex(value, `${label} bytecode`);
  if (hex.length % 2 !== 0) {
    throw new RobexAppError('PROVIDER_ERROR', `${label} bytecode was not even-length hex.`, {
      reason: 'BAD_RPC_RESPONSE',
      contract: label,
    });
  }
  const bytes = hexToBytes(hex);
  const hash = keccak256Hex(bytes);
  if (bytes.length !== expected.bytes || hash.toLowerCase() !== expected.keccak256.toLowerCase()) {
    throw new RobexAppError('PROVIDER_ERROR', `${label} bytecode does not match the approved contract.`, {
      reason: 'BYTECODE_MISMATCH',
      contract: label,
      bytes: bytes.length,
    });
  }
}

function blocked(result: Extract<PoolAssessment, { ok: false }>, block?: { number: string; hash: string }): RobexAppError {
  return new RobexAppError('QUOTE_ERROR', result.message, {
    reason: result.reason,
    capWei: result.capWei?.toString(),
    blockNumber: block?.number,
    blockHash: block?.hash,
  });
}

export class UniswapV4ReadOnlyAdapter implements LiquidityAdapter {
  public readonly id = 'uniswap-v4-readonly-adapter';
  public readonly source: RouteSource = {
    id: 'uniswap-v4-eth-usdg',
    name: 'Uniswap v4',
    type: 'UNISWAP_V4',
  };

  constructor(
    private readonly rpc: ReadOnlyRpc,
    private readonly pins: V4QuotePins = UNISWAP_V4_TESTNET_QUOTE,
    private readonly now: () => number = Date.now,
  ) {}

  public async getQuote(request: QuoteRequest): Promise<Quote> {
    const amountIn = this.assertRequest(request);
    const slippageBps = resolveSlippageBps(request);
    if (request.slippageBps !== undefined && request.slippageTolerancePercent !== undefined) {
      const fromPercent = resolveSlippageBps({ slippageTolerancePercent: request.slippageTolerancePercent });
      if (fromPercent !== slippageBps) {
        throw new RobexAppError('USER_ERROR', 'Slippage fields do not agree.');
      }
    }
    this.assertPins();

    const readStartedAtMs = this.now();
    const chainHex = requireHex(await this.rpc.request('eth_chainId', []), 'chain id');
    if (BigInt(chainHex) !== BigInt(this.pins.chainId)) {
      throw new RobexAppError('PROVIDER_ERROR', `RPC chain id ${chainHex} is not ${this.pins.chainId}.`, {
        reason: 'CHAIN_MISMATCH',
      });
    }

    const block = await this.rpc.request('eth_getBlockByNumber', ['latest', false]);
    if (!block || typeof block !== 'object') {
      throw new RobexAppError('PROVIDER_ERROR', 'RPC did not return a block.', { reason: 'BAD_RPC_RESPONSE' });
    }
    const blockRecord = block as { number?: unknown; hash?: unknown; timestamp?: unknown };
    const blockTag = requireHex(blockRecord.number, 'block number');
    const blockHash = requireHex(blockRecord.hash, 'block hash');
    const blockTimestampHex = requireHex(blockRecord.timestamp, 'block timestamp');
    if (blockHash.length !== 66) {
      throw new RobexAppError('PROVIDER_ERROR', 'RPC block hash has the wrong length.', { reason: 'BAD_RPC_RESPONSE' });
    }
    const blockTimestampSeconds = BigInt(blockTimestampHex);
    // Reject an already stale or future block before any pool read. The same
    // check runs again after the quote so a slow sequence cannot mint a new 20s life.
    resolveQuoteFreshness(blockTimestampSeconds, readStartedAtMs, this.now());
    const blockIdentity = { number: BigInt(blockTag).toString(), hash: blockHash.toLowerCase() };

    const codeTargets = [
      ['PoolManager', this.pins.poolManager, this.pins.code.poolManager],
      ['StateView', this.pins.stateView, this.pins.code.stateView],
      ['V4Quoter', this.pins.v4Quoter, this.pins.code.v4Quoter],
      ['USDG', this.pins.usdg, this.pins.code.usdg],
    ] as const;
    for (const [label, address, expected] of codeTargets) {
      assertCode(label, await this.rpc.request('eth_getCode', [address, blockTag]), expected);
    }

    const stateViewManager = decodeAddress(decodeWord(requireHex(
      await this.rpc.request('eth_call', [{ to: this.pins.stateView, data: bytesToHex(SELECTOR.poolManager) }, blockTag]),
      'StateView.poolManager',
    ), 0));
    const quoterManager = decodeAddress(decodeWord(requireHex(
      await this.rpc.request('eth_call', [{ to: this.pins.v4Quoter, data: bytesToHex(SELECTOR.poolManager) }, blockTag]),
      'V4Quoter.poolManager',
    ), 0));
    if (!sameAddress(stateViewManager, this.pins.poolManager) || !sameAddress(quoterManager, this.pins.poolManager)) {
      throw new RobexAppError('PROVIDER_ERROR', 'StateView or V4Quoter does not point at the approved PoolManager.', {
        reason: 'LINKAGE_MISMATCH',
        blockNumber: blockIdentity.number,
        blockHash: blockIdentity.hash,
      });
    }

    const decimals = decodeWord(requireHex(
      await this.rpc.request('eth_call', [{ to: this.pins.usdg, data: bytesToHex(SELECTOR.decimals) }, blockTag]),
      'USDG.decimals',
    ), 0);
    if (decimals !== 6n) {
      throw new RobexAppError('QUOTE_ERROR', 'Paxos USDG decimals were not 6. No quote is available.', {
        reason: 'TOKEN_DECIMALS',
        blockNumber: blockIdentity.number,
      });
    }

    const slot0Hex = requireHex(
      await this.rpc.request('eth_call', [{
        to: this.pins.stateView,
        data: encodeWordCall(SELECTOR.getSlot0, this.pins.poolId),
      }, blockTag]),
      'StateView.getSlot0',
    );
    const liquidityHex = requireHex(
      await this.rpc.request('eth_call', [{
        to: this.pins.stateView,
        data: encodeWordCall(SELECTOR.getLiquidity, this.pins.poolId),
      }, blockTag]),
      'StateView.getLiquidity',
    );
    if (slot0Hex.length !== 2 + 64 * 4 || liquidityHex.length !== 2 + 64) {
      throw new RobexAppError('PROVIDER_ERROR', 'StateView returned an unexpected payload.', {
        reason: 'BAD_RPC_RESPONSE',
        blockNumber: blockIdentity.number,
      });
    }

    const sqrtPriceX96 = decodeWord(slot0Hex, 0);
    const tick = Number(decodeSignedWord(decodeWord(slot0Hex, 1)));
    const protocolFeeWord = decodeWord(slot0Hex, 2);
    const lpFeeWord = decodeWord(slot0Hex, 3);
    if (protocolFeeWord !== 0n || lpFeeWord !== BigInt(this.pins.feePips)) {
      throw blocked({
        ok: false,
        reason: 'POOL_FEE_MISMATCH',
        message: 'The pool fee does not match the approved 0.30% static fee. No quote is available.',
      }, blockIdentity);
    }
    const protocolFee = 0;
    const lpFeePips = this.pins.feePips;
    const liquidity = decodeWord(liquidityHex, 0);
    const assessment = assessPool({
      sqrtPriceX96,
      tick,
      liquidity,
      lpFeePips,
      protocolFee,
      tickSpacing: this.pins.tickSpacing,
      approvedFeePips: this.pins.feePips,
    }, amountIn);
    if (!assessment.ok) throw blocked(assessment, blockIdentity);

    let quoteHex: string;
    try {
      quoteHex = requireHex(await this.rpc.request('eth_call', [{
        to: this.pins.v4Quoter,
        data: encodeQuoteExactInputSingle(amountIn),
      }, blockTag]), 'V4Quoter.quoteExactInputSingle');
    } catch (err) {
      if (err instanceof RobexAppError && err.details?.reason === 'RPC_REVERT') {
        throw new RobexAppError('QUOTE_ERROR', 'The Uniswap v4 quoter rejected this amount. No quote is available.', {
          reason: 'QUOTER_REVERTED',
          blockNumber: blockIdentity.number,
          blockHash: blockIdentity.hash,
        });
      }
      throw err;
    }
    if (quoteHex.length !== 2 + 64 * 2) {
      throw new RobexAppError('PROVIDER_ERROR', 'V4Quoter returned an unexpected payload.', {
        reason: 'BAD_RPC_RESPONSE',
        blockNumber: blockIdentity.number,
      });
    }

    const amountOut = decodeWord(quoteHex, 0);
    const feeAdjusted = feeAdjustedRatio(amountIn, sqrtPriceX96, BigInt(this.pins.feePips));
    let impact;
    try {
      impact = assertRationalImpactAllowsQuote(feeAdjusted, amountOut);
    } catch (err) {
      if (err instanceof RobexAppError && err.details) {
        throw new RobexAppError(err.code, err.message, {
          ...err.details,
          blockNumber: blockIdentity.number,
          blockHash: blockIdentity.hash,
        });
      }
      throw err;
    }

    const freshness = resolveQuoteFreshness(blockTimestampSeconds, readStartedAtMs, this.now());
    const minimum = minimumAmountOut(amountOut, slippageBps);
    return {
      id: `v4-${blockIdentity.number}-${amountIn.toString()}`,
      source: this.source,
      chainId: this.pins.chainId,
      tokenIn: this.pins.nativeEth,
      tokenOut: this.pins.usdg,
      amountIn: amountIn.toString(),
      expectedAmountOut: amountOut.toString(),
      minimumAmountOut: minimum.toString(),
      priceImpactPercent: Number(impact.displayPercent),
      priceImpactPercentExact: impact.displayPercent,
      risk: impact.risk,
      slippageBps: Number(slippageBps),
      poolFeePips: this.pins.feePips,
      referenceAmountOut: (feeAdjusted.numerator / feeAdjusted.denominator).toString(),
      referenceRate: assessment.spotRate,
      blockNumber: blockIdentity.number,
      blockHash: blockIdentity.hash,
      blockTimestamp: blockTimestampSeconds.toString(),
      quotedAt: freshness.quotedAt,
      expiresAt: freshness.expiresAt,
      tokenInSymbol: 'ETH',
      tokenOutSymbol: 'USDG',
      tokenInDecimals: 18,
      tokenOutDecimals: 6,
      poolId: this.pins.poolId,
      limitations: [USDG_VALUE_NOTICE, QUOTE_ESTIMATE_NOTICE, QUOTER_VERIFICATION_NOTICE],
    };
  }

  private assertRequest(request: QuoteRequest): bigint {
    if (request.chainId !== this.pins.chainId) {
      throw new RobexAppError('QUOTE_ERROR', `Quotes are only available on chain ${this.pins.chainId}.`, {
        reason: 'CHAIN',
        chainId: request.chainId,
      });
    }
    if (!ADDRESS.test(request.tokenIn) || !ADDRESS.test(request.tokenOut)) {
      throw new RobexAppError('QUOTE_ERROR', 'tokenIn and tokenOut must be 20-byte addresses.', {
        reason: 'TOKEN_NOT_ALLOWED',
      });
    }
    const tokenIn = request.tokenIn.toLowerCase();
    const tokenOut = request.tokenOut.toLowerCase();
    if (tokenIn === this.pins.weth.toLowerCase() || tokenOut === this.pins.weth.toLowerCase()) {
      throw new RobexAppError('QUOTE_ERROR', 'Official testnet WETH is allowlisted but is not a quotable pair in this version.', {
        reason: 'WETH_NOT_QUOTABLE',
      });
    }
    if (tokenIn !== this.pins.nativeEth.toLowerCase() || tokenOut !== this.pins.usdg.toLowerCase()) {
      throw new RobexAppError('QUOTE_ERROR', 'The only quotable pair is native ETH to Paxos testnet USDG.', {
        reason: 'TOKEN_NOT_ALLOWED',
      });
    }
    if (!/^(?:0|[1-9]\d*)$/.test(request.amountIn)) {
      throw new RobexAppError('QUOTE_ERROR', 'amountIn must be a positive integer string');
    }
    const amountIn = BigInt(request.amountIn);
    if (amountIn <= 0n) {
      throw new RobexAppError('QUOTE_ERROR', 'amountIn must be a positive integer string');
    }
    if (amountIn > ABSOLUTE_ETH_CAP_WEI) {
      throw new RobexAppError('QUOTE_ERROR', 'The read-only limit is 0.0001 ETH.', { reason: 'ABSOLUTE_CAP' });
    }
    return amountIn;
  }

  private assertPins(): void {
    const active = getActiveNetworkConfig();
    if (!active.isTestnet || active.chainId !== this.pins.chainId) {
      throw new RobexAppError('QUOTE_ERROR', 'The active network is not the approved testnet.', { reason: 'CHAIN' });
    }
    const contracts = active.contracts;
    const aligned = sameAddress(contracts.poolManager, this.pins.poolManager)
      && sameAddress(contracts.stateView, this.pins.stateView)
      && sameAddress(contracts.v4Quoter, this.pins.v4Quoter)
      && sameAddress(contracts.poolId, this.pins.poolId)
      && sameAddress(contracts.usdg, this.pins.usdg)
      && sameAddress(this.pins.nativeEth, '0x0000000000000000000000000000000000000000')
      && sameAddress(this.pins.usdg, '0x7E955252E15c84f5768B83c41a71F9eba181802F')
      && sameAddress(this.pins.hooks, '0x0000000000000000000000000000000000000000')
      && this.pins.feePips === 3000
      && this.pins.tickSpacing === 60;
    if (!aligned || computePoolId().toLowerCase() !== this.pins.poolId.toLowerCase()) {
      throw new RobexAppError('QUOTE_ERROR', 'The quote configuration does not match the approved ETH → USDG pool.', {
        reason: 'POOL_ID_MISMATCH',
      });
    }
  }
}
