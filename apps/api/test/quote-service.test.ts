import { describe, it, expect } from 'vitest';
import { QuoteService } from '../src/services/quote.service.js';
import { ConstantProductSimulationAdapter } from '../src/adapters/constant-product-simulation-adapter.js';
import { MockRpcLiquidityProvider } from '../src/providers/mock-rpc-liquidity-provider.js';

describe('Architecture Boundary: Feature -> Service -> Adapter -> Provider', () => {
  const provider = new MockRpcLiquidityProvider();
  const adapter = new ConstantProductSimulationAdapter(provider);
  const quoteService = new QuoteService([adapter]);

  it('successfully retrieves normalized Quote across all layers', async () => {
    // 1 ETH in wei
    const amountIn = '1000000000000000000';
    const quote = await quoteService.getBestQuote({
      chainId: 46630,
      tokenIn: '0x0000000000000000000000000000000000000000',
      tokenOut: '0x1111111111111111111111111111111111111111',
      amountIn,
      slippageTolerancePercent: 0.5,
    });

    expect(quote).toBeDefined();
    expect(quote.chainId).toBe(46630);
    expect(quote.source.type).toBe('SIMULATED_FOUNDATION');
    expect(BigInt(quote.expectedAmountOut)).toBeGreaterThan(0n);
    expect(BigInt(quote.minimumAmountOut)).toBeLessThan(BigInt(quote.expectedAmountOut));
    expect(quote.priceImpactPercent).toBeGreaterThanOrEqual(0);
    expect(quote.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects unsupported chain IDs cleanly via centralized error shape', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 999999, // unsupported
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
      })
    ).rejects.toThrow('Chain ID 999999 is not supported');
  });

  it('rejects identical input and output tokens', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0xTOKEN',
        tokenOut: '0xTOKEN',
        amountIn: '1000',
      })
    ).rejects.toThrow('tokenIn and tokenOut cannot be identical');
  });
});
