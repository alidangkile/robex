import type { LiquidityProvider, RawPoolReserves } from './liquidity-provider.interface.js';

/**
 * Foundation Provider: Reads pool reserves simulated against Testnet environment.
 * Replaces external RPC dependencies during local testing without leaking secrets.
 */
export class MockRpcLiquidityProvider implements LiquidityProvider {
  public readonly id = 'mock-rpc-provider';
  public readonly name = 'Robinhood Chain Testnet RPC Provider';

  public async getReserves(tokenIn: string, tokenOut: string): Promise<RawPoolReserves> {
    // Provide deterministic simulated reserves for foundation verification
    return {
      tokenIn,
      tokenOut,
      reserveIn: 100000000000000000000n, // 100 ETH equivalent
      reserveOut: 300000000000n,          // 300,000 USDC equivalent (6 decimals)
      estimatedFeeBps: 30,                // 0.3%
    };
  }
}
