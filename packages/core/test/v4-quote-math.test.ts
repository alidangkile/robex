import { describe, expect, it } from 'vitest';
import { RobexAppError } from '../src/errors/index.js';
import { keccak256Hex } from '../src/crypto/keccak256.js';
import {
  SELECTOR,
  bytesToHex,
  computePoolId,
  encodeQuoteExactInputSingle,
} from '../src/quote/v4-abi.js';
import {
  ABSOLUTE_ETH_CAP_WEI,
  activeRangeInputCap,
  activeTickRange,
  amount0Delta,
  acceptDisplayedQuote,
  assertImpactAllowsQuote,
  assertRationalImpactAllowsQuote,
  assessPool,
  classifyPriceImpact,
  classifyRationalPriceImpact,
  feeAdjustedAmountOut,
  feeAdjustedRatio,
  resolveQuoteFreshness,
  formatBaseUnits,
  getSqrtRatioAtTick,
  minimumAmountOut,
  parseEthAmountInput,
  resolveSlippageBps,
  sqrtPriceMatchesTick,
} from '../src/quote/v4-math.js';

const HISTORICAL_SQRT = 3759471235661676040702346n;
const HISTORICAL_TICK = -199127;
const HISTORICAL_LIQUIDITY = 103923048454n;
const QUOTE_CALLDATA = '0xaa9d21cb000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007e955252e15c84f5768b83c41a71f9eba181802f0000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000005af3107a400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000';

describe('Ethereum Keccak and Uniswap v4 encoding', () => {
  it('matches Ethereum Keccak-256, not NIST SHA3', () => {
    expect(keccak256Hex(new Uint8Array())).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    expect(keccak256Hex(new TextEncoder().encode('abc'))).toBe('0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  });

  it('recomputes the approved pool id and quote selector', () => {
    expect(computePoolId()).toBe('0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669');
    expect(bytesToHex(SELECTOR.quoteExactInputSingle)).toBe('0xaa9d21cb');
    expect(bytesToHex(SELECTOR.getSlot0)).toBe('0xc815641c');
    expect(bytesToHex(SELECTOR.getLiquidity)).toBe('0xfa6793d5');
    expect(bytesToHex(SELECTOR.poolManager)).toBe('0xdc4c90d3');
    expect(encodeQuoteExactInputSingle(100_000_000_000_000n)).toBe(QUOTE_CALLDATA);
    expect(computePoolId({
      currency0: '0x0000000000000000000000000000000000000000',
      currency1: '0x7E955252E15c84f5768B83c41a71F9eba181802F',
      feePips: 3000,
      tickSpacing: 60,
      hooks: '0x0000000000000000000000000000000000000001',
    })).not.toBe(computePoolId());
  });
});

describe('Uniswap v4 quote math', () => {
  it('uses the canonical sqrt price at tick boundaries', () => {
    expect(getSqrtRatioAtTick(0)).toBe(79228162514264337593543950336n);
    expect(sqrtPriceMatchesTick(HISTORICAL_SQRT, HISTORICAL_TICK)).toBe(true);
    expect(sqrtPriceMatchesTick(HISTORICAL_SQRT, HISTORICAL_TICK + 1)).toBe(false);
    expect(activeTickRange(HISTORICAL_TICK, 60)).toEqual({ tickLower: -199140, tickUpper: -199080 });
  });

  it('rounds the token0 delta down and up with integer math', () => {
    expect(amount0Delta(1000n, 2000n, 5000n, false)).toBe(198070406285660843983859875840n);
    expect(amount0Delta(1000n, 2000n, 5000n, true)).toBe(198070406285660843983859875840n);
    expect(amount0Delta(3n, 5n, 7n, false)).toBeLessThanOrEqual(amount0Delta(3n, 5n, 7n, true));
  });

  it('keeps the recorded thin-pool ratio above the 2% block and does not freeze its output as a live price', () => {
    expect(feeAdjustedAmountOut(100_000_000_000_000n, HISTORICAL_SQRT, 3000n)).toBe(224486n);
    expect(classifyPriceImpact(224486n, 214711n).risk).toBe('blocked');
    const small = feeAdjustedAmountOut(10_000_000_000_000n, HISTORICAL_SQRT, 3000n);
    expect(small).toBe(22448n);
    expect(classifyPriceImpact(small, 22346n).risk).toBe('normal');
  });

  it('classifies the 1% and 2% boundaries without floating point', () => {
    const spot = 10000n;
    expect(classifyPriceImpact(spot, 9901n)).toEqual({ risk: 'normal', displayPercent: '0.9900' });
    expect(classifyPriceImpact(spot, 9900n)).toEqual({ risk: 'warning', displayPercent: '1.0000' });
    expect(classifyPriceImpact(spot, 9800n)).toEqual({ risk: 'warning', displayPercent: '2.0000' });
    expect(classifyPriceImpact(spot, 9799n)).toEqual({ risk: 'blocked', displayPercent: '2.0100' });
    expect(classifyPriceImpact(spot, spot + 1n)).toEqual({ risk: 'normal', displayPercent: '0.0000' });
    expect(() => classifyPriceImpact(spot, spot + 2n)).toThrow(RobexAppError);
  });

  it('floors minimum received and separates it from price impact', () => {
    expect(minimumAmountOut(1001n, 50n)).toBe(995n);
    expect(minimumAmountOut(214711n, 50n)).toBe(213637n);
    expect(minimumAmountOut(10n, 0n)).toBe(10n);
    expect(minimumAmountOut(10n, 5000n)).toBe(5n);
    expect(resolveSlippageBps({})).toBe(50n);
    expect(resolveSlippageBps({ slippageTolerancePercent: 0.1 })).toBe(10n);
    expect(resolveSlippageBps({ slippageBps: 100 })).toBe(100n);
    expect(() => resolveSlippageBps({ slippageTolerancePercent: Number.NaN })).toThrow(/Invalid slippage/);
    expect(minimumAmountOut(1n, 50n)).toBe(0n);
  });

  it('keeps a tiny raw-unit impact blocked when 6-decimal text looks small', () => {
    expect(formatBaseUnits(50n, 6)).toBe('0.00005');
    expect(formatBaseUnits(48n, 6)).toBe('0.000048');
    expect(classifyPriceImpact(50n, 48n)).toMatchObject({ risk: 'blocked' });
    expect(classifyPriceImpact(50n, 49n)).toMatchObject({ risk: 'warning', displayPercent: '2.0000' });
    expect(classifyPriceImpact(50n, 0n).risk).toBe('blocked');
    expect(() => assertImpactAllowsQuote(50n, 0n)).toThrow(/no USDG output/);
  });

  it('compares price impact to the unrounded fee-adjusted ratio', () => {
    const sqrt = 3759471235661676040702346n;
    const blockedAmount = 21_825_000_000n;
    const blocked = feeAdjustedRatio(blockedAmount, sqrt, 3000n);
    expect(100n * (blocked.numerator - 48n * blocked.denominator) > 2n * blocked.numerator).toBe(true);
    expect(classifyRationalPriceImpact(blocked, 48n)).toEqual({ risk: 'blocked', displayPercent: '2.0291' });
    expect(() => assertRationalImpactAllowsQuote(blocked, 48n)).toThrow(/2\.0291%/);

    const warningAmount = 22_700_000_000n;
    const warning = feeAdjustedRatio(warningAmount, sqrt, 3000n);
    expect(100n * (warning.numerator - 50n * warning.denominator) > 2n * warning.numerator).toBe(false);
    expect(classifyRationalPriceImpact(warning, 50n)).toEqual({ risk: 'warning', displayPercent: '1.8806' });
    expect(assertRationalImpactAllowsQuote(warning, 50n).risk).toBe('warning');
  });

  it('anchors the 20-second window to the chain block and rejects stale, future, and slow reads', () => {
    const started = 1_700_000_000_000;
    const blockSec = 1_700_000_000n;
    const fresh = resolveQuoteFreshness(blockSec, started, started + 19_999);
    expect(fresh.quotedAt).toBe(1_700_000_000_000);
    expect(fresh.expiresAt - fresh.quotedAt).toBe(20_000);

    expect(resolveQuoteFreshness(blockSec - 19n, started, started).expiresAt).toBe((1_700_000_000 - 19) * 1000 + 20_000);
    expect(() => resolveQuoteFreshness(blockSec - 20n, started, started)).toThrow(/outside the 20-second/);
    expect(() => resolveQuoteFreshness(blockSec + 1n, started, started)).toThrow(/ahead of the quote clock/);
    expect(() => resolveQuoteFreshness(blockSec, started, started + 20_000)).toThrow(/longer than the 20-second/);
    expect(() => resolveQuoteFreshness(blockSec, started, started - 1)).toThrow(/not usable/);
  });

  it('keeps a displayed quote inside the block deadline and on the requested identity', () => {
    const now = 1_700_000_019_999;
    const blockSec = '1700000000';
    const identity = {
      chainId: 46630,
      tokenIn: '0x0000000000000000000000000000000000000000',
      tokenOut: '0x7E955252E15c84f5768B83c41a71F9eba181802F',
      amountIn: '500000000000',
      slippageBps: 50,
      poolId: '0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669',
    };
    const quote = {
      source: { id: 'uniswap-v4-eth-usdg', name: 'Uniswap v4', type: 'UNISWAP_V4' as const },
      chainId: 46630,
      tokenIn: identity.tokenIn,
      tokenOut: identity.tokenOut,
      amountIn: identity.amountIn,
      expectedAmountOut: '1122',
      minimumAmountOut: '1116',
      priceImpactPercent: 0,
      risk: 'normal' as const,
      slippageBps: 50,
      blockNumber: '16',
      blockHash: `0x${'ab'.repeat(32)}`,
      blockTimestamp: blockSec,
      quotedAt: 1_700_000_000_000,
      expiresAt: 1_700_000_000_000 + 3_600_000,
      poolId: identity.poolId,
    };
    const accepted = acceptDisplayedQuote(quote, identity, now);
    expect(accepted.expiresAt).toBe(1_700_000_000_000 + 20_000);
    expect(accepted.quotedAt).toBe(1_700_000_000_000);
    expect(accepted.expectedAmountOut).toBe('1122');

    expect(() => acceptDisplayedQuote({ ...quote, quotedAt: quote.quotedAt + 5_000 }, identity, now)).toThrow(/does not match the chain block/);
    expect(() => acceptDisplayedQuote({ ...quote, chainId: 1 }, identity, now)).toThrow(/different chain/);
    expect(() => acceptDisplayedQuote({ ...quote, tokenIn: '0x0000000000000000000000000000000000000009' }, identity, now)).toThrow(/token pair/);
    expect(() => acceptDisplayedQuote({ ...quote, tokenOut: '0x0000000000000000000000000000000000000008' }, identity, now)).toThrow(/token pair/);
    expect(() => acceptDisplayedQuote({ ...quote, amountIn: '999' }, identity, now)).toThrow(/amount does not match/);
    expect(() => acceptDisplayedQuote({ ...quote, slippageBps: 100 }, identity, now)).toThrow(/slippage does not match/);
    expect(() => acceptDisplayedQuote({ ...quote, poolId: `0x${'cd'.repeat(32)}` }, identity, now)).toThrow(/pool does not match/);
    expect(() => acceptDisplayedQuote({ ...quote, minimumAmountOut: '2000' }, identity, now)).toThrow(/minimum received is above/);
    expect(() => acceptDisplayedQuote({ ...quote, blockTimestamp: String(1_700_000_000 - 20) }, identity, now)).toThrow(/outside the 20-second/);
  });

  it('parses ETH decimals to wei and rejects the absolute cap before a quote', () => {
    expect(parseEthAmountInput('')).toEqual({ status: 'empty' });
    expect(parseEthAmountInput('0.0001')).toEqual({ status: 'ok', wei: ABSOLUTE_ETH_CAP_WEI.toString() });
    expect(parseEthAmountInput('0.00001')).toEqual({ status: 'ok', wei: '10000000000000' });
    expect(parseEthAmountInput('0.000000000000000001')).toEqual({ status: 'ok', wei: '1' });
    expect(parseEthAmountInput('0')).toMatchObject({ status: 'invalid' });
    expect(parseEthAmountInput('1')).toMatchObject({ message: 'The read-only limit is 0.0001 ETH.' });
    expect(parseEthAmountInput('1e-4')).toMatchObject({ status: 'invalid' });
    expect(parseEthAmountInput('0.00000000000000000001').message).toMatch(/18 decimal/);
    expect(formatBaseUnits(22346n, 6)).toBe('0.022346');
    expect(formatBaseUnits(100000000000000n, 18)).toBe('0.0001');
  });

  it('refuses a quote when the safe active-range cap cannot be established', () => {
    const atBoundary = assessPool({
      sqrtPriceX96: getSqrtRatioAtTick(0),
      tick: 0,
      liquidity: 1_000_000n,
      lpFeePips: 3000,
      protocolFee: 0,
      tickSpacing: 60,
      approvedFeePips: 3000,
    }, 1n);
    expect(atBoundary.ok).toBe(false);
    if (!atBoundary.ok) expect(atBoundary.reason).toBe('SAFE_CAP_UNKNOWN');

    const noLiquidity = assessPool({
      sqrtPriceX96: HISTORICAL_SQRT,
      tick: HISTORICAL_TICK,
      liquidity: 0n,
      lpFeePips: 3000,
      protocolFee: 0,
      tickSpacing: 60,
      approvedFeePips: 3000,
    }, 1n);
    expect(noLiquidity.ok).toBe(false);
    if (!noLiquidity.ok) expect(noLiquidity.reason).toBe('NO_LIQUIDITY');

    const thrown = assessPool({
      sqrtPriceX96: HISTORICAL_SQRT,
      tick: HISTORICAL_TICK,
      liquidity: HISTORICAL_LIQUIDITY,
      lpFeePips: 3000,
      protocolFee: 0,
      tickSpacing: 0,
      approvedFeePips: 3000,
    }, 1n);
    expect(thrown.ok).toBe(false);
    if (!thrown.ok) expect(thrown.reason).toBe('SAFE_CAP_UNKNOWN');
  });

  it('caps input at 50% of the ETH needed to reach the active-range boundary', () => {
    const cap = activeRangeInputCap(HISTORICAL_SQRT, HISTORICAL_TICK, HISTORICAL_LIQUIDITY, 60);
    expect(cap).toBe(759572282608n);
    const allowed = assessPool({
      sqrtPriceX96: HISTORICAL_SQRT,
      tick: HISTORICAL_TICK,
      liquidity: HISTORICAL_LIQUIDITY,
      lpFeePips: 3000,
      protocolFee: 0,
      tickSpacing: 60,
      approvedFeePips: 3000,
    }, cap!);
    const over = assessPool({
      sqrtPriceX96: HISTORICAL_SQRT,
      tick: HISTORICAL_TICK,
      liquidity: HISTORICAL_LIQUIDITY,
      lpFeePips: 3000,
      protocolFee: 0,
      tickSpacing: 60,
      approvedFeePips: 3000,
    }, cap! + 1n);
    expect(allowed.ok).toBe(true);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('RANGE_CAP');
  });
});
