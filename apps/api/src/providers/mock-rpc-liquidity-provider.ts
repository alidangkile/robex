import type { LiquidityProvider, RawPoolReserves } from './liquidity-provider.interface.js';

/**
 * Plan 001 Foundation Provider:
 * Deterministic simulated provider for architecture boundary verification only — NOT live liquidity.
 * Provides verifiable simulated reserves without external network dependencies.
 */
export class MockRpcLiquidityProvider implements LiquidityProvider {
  public readonly id = 'simulated-dev-rpc-provider';
  public readonly name = 'Simulated Dev Liquidity Provider (Plan 001 Foundation)';

  public async getReserves(tokenIn: string, tokenOut: string): Promise<RawPoolReserves> {
    return {
      tokenIn,
      tokenOut,
      reserveIn: 100000000000000000000n, // Simulated 100 ETH equivalent
      reserveOut: 300000000000n,          // Simulated 300,000 USDC equivalent (6 decimals)
      estimatedFeeBps: 30,                // 0.3%
    };
  }
}
