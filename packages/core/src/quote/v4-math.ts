import { RobexAppError } from '../errors/index.js';

export const ABSOLUTE_ETH_CAP_WEI = 100_000_000_000_000n;
export const QUOTE_TTL_MS = 20_000;
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

export const USDG_VALUE_NOTICE = 'Testnet USDG has no monetary or redemption value.';
export const QUOTE_ESTIMATE_NOTICE = 'This quote is an estimate from one Uniswap v4 pool, not an executable swap or a guaranteed price.';
export const QUOTER_VERIFICATION_NOTICE = 'The V4Quoter was not marked verified on the block explorer during Plan 003A. Robex checks bytecode, PoolManager linkage, and the pool id on every quote.';

const Q192 = 1n << 192n;
const FEE_DENOMINATOR = 1_000_000n;
const IMPACT_SCALE = 1_000_000n;

export interface ImpactAssessment {
  risk: 'normal' | 'warning' | 'blocked';
  displayPercent: string;
}

export interface PoolObservation {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  lpFeePips: number;
  protocolFee: number;
  tickSpacing: number;
  approvedFeePips: number;
}

export type PoolAssessment =
  | { ok: true; capWei: bigint; spotRate: string }
  | { ok: false; reason: string; message: string; capWei?: bigint };

function divRoundUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('division by zero');
  return (numerator + denominator - 1n) / denominator;
}

export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = tick < 0 ? -tick : tick;
  if (!Number.isInteger(tick) || absTick > MAX_TICK) {
    throw new Error(`Tick ${tick} is outside the Uniswap range`);
  }

  let ratio = (absTick & 0x1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  const remainder = ratio & 0xffffffffn;
  return (ratio >> 32n) + (remainder === 0n ? 0n : 1n);
}

export function sqrtPriceMatchesTick(sqrtPriceX96: bigint, tick: number): boolean {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick >= MAX_TICK) return false;
  try {
    return sqrtPriceX96 >= getSqrtRatioAtTick(tick) && sqrtPriceX96 < getSqrtRatioAtTick(tick + 1);
  } catch {
    return false;
  }
}

export function activeTickRange(tick: number, tickSpacing: number): { tickLower: number; tickUpper: number } {
  if (!Number.isInteger(tick) || !Number.isInteger(tickSpacing) || tickSpacing <= 0) {
    throw new Error('Tick spacing must be a positive integer');
  }
  const compressed = Math.floor(tick / tickSpacing);
  const tickLower = compressed * tickSpacing;
  return { tickLower, tickUpper: tickLower + tickSpacing };
}

export function amount0Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  let left = sqrtA;
  let right = sqrtB;
  if (left > right) {
    const swapped = left;
    left = right;
    right = swapped;
  }
  if (left <= 0n || liquidity < 0n) throw new Error('Liquidity delta inputs are invalid');
  const numerator = (liquidity << 96n) * (right - left);
  if (roundUp) return divRoundUp(divRoundUp(numerator, right), left);
  return (numerator / right) / left;
}

export function activeRangeInputCap(sqrtPriceX96: bigint, tick: number, liquidity: bigint, tickSpacing: number): bigint | null {
  if (liquidity <= 0n || sqrtPriceX96 <= 0n) return null;
  const { tickLower } = activeTickRange(tick, tickSpacing);
  const sqrtLower = getSqrtRatioAtTick(tickLower);
  if (sqrtPriceX96 <= sqrtLower) return null;
  const needed = amount0Delta(sqrtLower, sqrtPriceX96, liquidity, true);
  if (needed <= 1n) return null;
  return needed / 2n;
}

export function spotAmountOut(amountIn: bigint, sqrtPriceX96: bigint): bigint {
  if (amountIn < 0n || sqrtPriceX96 <= 0n) throw new Error('Spot inputs are invalid');
  return amountIn * sqrtPriceX96 * sqrtPriceX96 / Q192;
}

export function feeAdjustedAmountOut(amountIn: bigint, sqrtPriceX96: bigint, feePips: bigint): bigint {
  if (feePips < 0n || feePips >= FEE_DENOMINATOR) throw new Error('Fee pips are invalid');
  const amountAfterFee = amountIn * (FEE_DENOMINATOR - feePips) / FEE_DENOMINATOR;
  return spotAmountOut(amountAfterFee, sqrtPriceX96);
}

export function formatBaseUnits(baseUnits: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid decimals');
  const negative = baseUnits < 0n;
  const value = negative ? -baseUnits : baseUnits;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  const text = fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

function formatImpact(adverse: bigint, spot: bigint, risk: ImpactAssessment['risk']): string {
  const scaled = risk === 'blocked'
    ? divRoundUp(adverse * IMPACT_SCALE, spot)
    : adverse * IMPACT_SCALE / spot;
  const whole = scaled / 10_000n;
  const fraction = (scaled % 10_000n).toString().padStart(4, '0');
  return `${whole.toString()}.${fraction}`;
}

export function classifyPriceImpact(feeAdjustedOut: bigint, quotedOut: bigint): ImpactAssessment {
  if (feeAdjustedOut <= 0n || quotedOut < 0n) {
    throw new RobexAppError('QUOTE_ERROR', 'The quote could not be compared with the fee-adjusted spot.', {
      reason: 'INCONSISTENT_STATE',
    });
  }
  if (quotedOut > feeAdjustedOut) {
    if (quotedOut - feeAdjustedOut > 1n) {
      throw new RobexAppError('QUOTE_ERROR', 'The quoter result is above the fee-adjusted spot. No quote is available.', {
        reason: 'INCONSISTENT_STATE',
      });
    }
    return { risk: 'normal', displayPercent: '0.0000' };
  }

  const adverse = feeAdjustedOut - quotedOut;
  let risk: ImpactAssessment['risk'] = 'normal';
  if (adverse * 10_000n > feeAdjustedOut * 200n) risk = 'blocked';
  else if (adverse * 10_000n >= feeAdjustedOut * 100n) risk = 'warning';
  return { risk, displayPercent: formatImpact(adverse, feeAdjustedOut, risk) };
}

export function minimumAmountOut(amountOut: bigint, slippageBps: bigint): bigint {
  if (amountOut < 0n || slippageBps < 0n || slippageBps > 5_000n) {
    throw new Error('Minimum received inputs are invalid');
  }
  return amountOut * (10_000n - slippageBps) / 10_000n;
}

export function resolveSlippageBps(request: { slippageBps?: number; slippageTolerancePercent?: number }): bigint {
  if (request.slippageBps !== undefined) {
    const bps = request.slippageBps;
    if (!Number.isInteger(bps) || bps < 0 || bps > 5000) {
      throw new RobexAppError('USER_ERROR', `Invalid slippage tolerance: ${String(bps)} bps. Slippage must be an integer from 0 to 5000 bps.`);
    }
    return BigInt(bps);
  }
  if (request.slippageTolerancePercent === undefined) return 50n;
  const percent = request.slippageTolerancePercent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 50) {
    throw new RobexAppError('USER_ERROR', `Invalid slippage tolerance: ${String(percent)}%. Slippage must be a finite number between 0% and 50%.`);
  }
  const scaled = percent * 100;
  const bps = Math.round(scaled);
  if (Math.abs(scaled - bps) > 1e-6) {
    throw new RobexAppError('USER_ERROR', 'Slippage must use at most two decimal places.');
  }
  return BigInt(bps);
}

export type EthInputParse =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | { status: 'ok'; wei: string };

export function parseEthAmountInput(input: string): EthInputParse {
  const trimmed = input.trim();
  if (trimmed === '') return { status: 'empty' };
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return { status: 'invalid', message: 'Enter an ETH amount as a decimal. Scientific notation is not accepted.' };
  }
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > 18) {
    return { status: 'invalid', message: 'ETH supports at most 18 decimal places.' };
  }
  const digits = `${whole}${fraction.padEnd(18, '0')}`.replace(/^0+/, '') || '0';
  if (digits === '0') return { status: 'invalid', message: 'Enter an amount greater than zero.' };
  const wei = BigInt(digits);
  if (wei > ABSOLUTE_ETH_CAP_WEI) {
    return { status: 'invalid', message: 'The read-only limit is 0.0001 ETH.' };
  }
  return { status: 'ok', wei: wei.toString() };
}

export function assessPool(observation: PoolObservation, amountIn: bigint): PoolAssessment {
  if (observation.lpFeePips !== observation.approvedFeePips || observation.protocolFee !== 0) {
    return {
      ok: false,
      reason: 'POOL_FEE_MISMATCH',
      message: 'The pool fee does not match the approved 0.30% static fee. No quote is available.',
    };
  }
  if (observation.liquidity <= 0n) {
    return {
      ok: false,
      reason: 'NO_LIQUIDITY',
      message: 'The pool has no in-range liquidity. No quote is available.',
    };
  }
  if (!sqrtPriceMatchesTick(observation.sqrtPriceX96, observation.tick)) {
    return {
      ok: false,
      reason: 'INCONSISTENT_STATE',
      message: 'The pool price and tick do not match. No quote is available.',
    };
  }
  if (amountIn <= 0n) {
    return { ok: false, reason: 'AMOUNT', message: 'amountIn must be a positive integer string' };
  }
  if (amountIn > ABSOLUTE_ETH_CAP_WEI) {
    return { ok: false, reason: 'ABSOLUTE_CAP', message: 'The read-only limit is 0.0001 ETH.' };
  }

  let capWei: bigint | null;
  try {
    capWei = activeRangeInputCap(
      observation.sqrtPriceX96,
      observation.tick,
      observation.liquidity,
      observation.tickSpacing,
    );
  } catch {
    capWei = null;
  }
  if (capWei === null || capWei <= 0n) {
    return {
      ok: false,
      reason: 'SAFE_CAP_UNKNOWN',
      message: 'A safe input cap could not be computed from the current range. No quote is available.',
    };
  }
  if (amountIn > capWei) {
    return {
      ok: false,
      reason: 'RANGE_CAP',
      message: `This amount is above 50% of the ETH that would reach the bottom of the active range. The current cap is ${formatBaseUnits(capWei, 18)} ETH.`,
      capWei,
    };
  }
  return {
    ok: true,
    capWei,
    spotRate: formatBaseUnits(spotAmountOut(10n ** 18n, observation.sqrtPriceX96), 6),
  };
}

export function assertImpactAllowsQuote(
  feeAdjustedOut: bigint,
  quotedOut: bigint,
): { risk: 'normal' | 'warning'; displayPercent: string } {
  if (quotedOut <= 0n) {
    throw new RobexAppError('QUOTE_ERROR', 'The quoter returned no USDG output. No quote is available.', {
      reason: 'NO_LIQUIDITY',
    });
  }
  const impact = classifyPriceImpact(feeAdjustedOut, quotedOut);
  if (impact.risk === 'blocked') {
    throw new RobexAppError(
      'QUOTE_ERROR',
      `Price impact is ${impact.displayPercent}%, above the 2% limit. This is not a valid quote.`,
      {
        reason: 'PRICE_IMPACT',
        priceImpactPercent: impact.displayPercent,
        quotedAmountOut: quotedOut.toString(),
        feeAdjustedAmountOut: feeAdjustedOut.toString(),
      },
    );
  }
  return { risk: impact.risk, displayPercent: impact.displayPercent };
}
