import { describe, it, expect } from 'vitest';
import { QuoteService } from '../src/services/quote.service.js';
import { ConstantProductSimulationAdapter } from '../src/adapters/constant-product-simulation-adapter.js';
import { MockRpcLiquidityProvider } from '../src/providers/mock-rpc-liquidity-provider.js';

describe('Architecture Boundary: Feature -> Service -> Adapter -> Provider', () => {
  const provider = new MockRpcLiquidityProvider();
  const adapter = new ConstantProductSimulationAdapter(provider);
  const quoteService = new QuoteService([adapter]);

  it('successfully retrieves normalized Quote without fake calldata or gas estimates', async () => {
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

    // Finding 5 Fix Verification: No fake calldata or gas estimate
    expect((quote as Record<string, unknown>).rawCalldata).toBeUndefined();
    expect((quote as Record<string, unknown>).estimatedGas).toBeUndefined();
  });

  // Finding 6 Boundary Tests: Chain ID validation
  it('rejects mainnet Chain ID (4663) even though mainnet schema exists in config', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 4663, // Robinhood Mainnet ID
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
      })
    ).rejects.toThrow('Quote requests in Plan 001 are strictly restricted to active testnet');
  });

  it('rejects arbitrary unsupported chain IDs cleanly', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 999999,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
      })
    ).rejects.toThrow('Quote requests in Plan 001 are strictly restricted to active testnet');
  });

  // Finding 7 Boundary Tests: Slippage validation
  it('rejects negative slippage values', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
        slippageTolerancePercent: -1,
      })
    ).rejects.toThrow('Invalid slippage tolerance: -1%');
  });

  it('rejects excessive slippage values (> 50%)', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
        slippageTolerancePercent: 50.1,
      })
    ).rejects.toThrow('Invalid slippage tolerance: 50.1%');
  });

  it('rejects non-finite slippage values (NaN, Infinity)', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
        slippageTolerancePercent: Number.NaN,
      })
    ).rejects.toThrow('Invalid slippage tolerance: NaN%');

    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1000',
        slippageTolerancePercent: Number.POSITIVE_INFINITY,
      })
    ).rejects.toThrow('Invalid slippage tolerance: Infinity%');
  });

  it('accepts valid slippage boundaries (0%, 0.5%, 50%)', async () => {
    const quote0 = await quoteService.getBestQuote({
      chainId: 46630,
      tokenIn: '0x0',
      tokenOut: '0x1',
      amountIn: '1000000000000000000',
      slippageTolerancePercent: 0,
    });
    expect(quote0.minimumAmountOut).toBe(quote0.expectedAmountOut);

    const quote50 = await quoteService.getBestQuote({
      chainId: 46630,
      tokenIn: '0x0',
      tokenOut: '0x1',
      amountIn: '1000000000000000000',
      slippageTolerancePercent: 50,
    });
    expect(BigInt(quote50.minimumAmountOut)).toBe(BigInt(quote50.expectedAmountOut) / 2n);
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

  it('rejects malformed amountIn before BigInt conversion', async () => {
    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: '1.5',
      })
    ).rejects.toThrow('amountIn must be a positive integer string');

    await expect(
      quoteService.getBestQuote({
        chainId: 46630,
        tokenIn: '0x0',
        tokenOut: '0x1',
        amountIn: 'abc',
      })
    ).rejects.toThrow('amountIn must be a positive integer string');
  });
});
