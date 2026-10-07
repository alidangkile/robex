import type { Quote, QuoteRequest, RouteSource } from '@robex/types';
import type { LiquidityAdapter } from './liquidity-adapter.interface.js';
import type { LiquidityProvider } from '../providers/liquidity-provider.interface.js';

/**
 * Constant Product Simulation Adapter.
 * Purpose: Demonstrates the Adapter boundary in Plan 001 architecture.
 * This is a deterministic simulation adapter for boundary verification — NOT an external protocol claim.
 * Note: Fake calldata and gas estimates are omitted in Plan 001.
 */
export class ConstantProductSimulationAdapter implements LiquidityAdapter {
  public readonly id = 'constant-product-simulation-adapter';
  public readonly source: RouteSource = {
    id: 'simulated-constant-product',
    name: 'Robinhood Testnet Simulated AMM (Foundation)',
    type: 'SIMULATED_FOUNDATION',
  };

  constructor(private readonly provider: LiquidityProvider) {}

  public async getQuote(request: QuoteRequest): Promise<Quote> {
    const reserves = await this.provider.getReserves(request.tokenIn, request.tokenOut);

    const amountInBigInt = BigInt(request.amountIn || '0');
    if (amountInBigInt <= 0n) {
      throw new Error('Amount in must be greater than zero');
    }

    // Standard constant product formula for boundary demonstration:
    // (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const amountInWithFee = amountInBigInt * 997n;
    const numerator = amountInWithFee * reserves.reserveOut;
    const denominator = reserves.reserveIn * 1000n + amountInWithFee;
    const expectedOutBigInt = numerator / denominator;

    // Apply slippage tolerance (default 0.5% = 50 bps)
    const slippageBps = BigInt(Math.floor((request.slippageTolerancePercent ?? 0.5) * 100));
    const minimumOutBigInt = (expectedOutBigInt * (10000n - slippageBps)) / 10000n;

    // Calculate approximate price impact in percent
    const idealRate = Number(reserves.reserveOut) / Number(reserves.reserveIn);
    const executionRate = Number(expectedOutBigInt) / Number(amountInBigInt);
    const priceImpactPercent = Math.max(0, Number(((idealRate - executionRate) / idealRate) * 100));

    return {
      id: `sim-quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: this.source,
      chainId: request.chainId,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: amountInBigInt.toString(),
      expectedAmountOut: expectedOutBigInt.toString(),
      minimumAmountOut: minimumOutBigInt.toString(),
      priceImpactPercent: Number(priceImpactPercent.toFixed(2)),
      expiresAt: Date.now() + 30000, // 30 seconds validity
    };
  }
}
