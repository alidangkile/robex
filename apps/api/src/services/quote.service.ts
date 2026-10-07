import type { Quote, QuoteRequest } from '@robex/types';
import { isSupportedChain } from '@robex/config';
import { RobexAppError } from '@robex/core';
import type { LiquidityAdapter } from '../adapters/liquidity-adapter.interface.js';

export class QuoteService {
  constructor(private readonly adapters: LiquidityAdapter[]) {
    if (adapters.length === 0) {
      throw new Error('QuoteService requires at least one LiquidityAdapter');
    }
  }

  public async getBestQuote(request: QuoteRequest): Promise<Quote> {
    if (!isSupportedChain(request.chainId)) {
      throw new RobexAppError(
        'NETWORK_ERROR',
        `Chain ID ${request.chainId} is not supported`,
        { chainId: request.chainId }
      );
    }

    if (!request.tokenIn || !request.tokenOut) {
      throw new RobexAppError('QUOTE_ERROR', 'tokenIn and tokenOut are required');
    }

    if (request.tokenIn.toLowerCase() === request.tokenOut.toLowerCase()) {
      throw new RobexAppError('QUOTE_ERROR', 'tokenIn and tokenOut cannot be identical');
    }

    if (!request.amountIn || BigInt(request.amountIn) <= 0n) {
      throw new RobexAppError('QUOTE_ERROR', 'amountIn must be a positive integer string');
    }

    // Call the primary adapter (extensible to multiple adapters in later plans)
    const primaryAdapter = this.adapters[0];
    try {
      const quote = await primaryAdapter.getQuote(request);
      return quote;
    } catch (err) {
      throw new RobexAppError(
        'PROVIDER_ERROR',
        `Failed to retrieve quote: ${(err as Error).message}`,
        { adapterId: primaryAdapter.id }
      );
    }
  }
}
