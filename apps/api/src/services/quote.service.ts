import type { Quote, QuoteRequest } from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';
import { RobexAppError } from '@robex/core';
import type { LiquidityAdapter } from '../adapters/liquidity-adapter.interface.js';

export class QuoteService {
  constructor(private readonly adapters: LiquidityAdapter[]) {
    if (adapters.length === 0) {
      throw new Error('QuoteService requires at least one LiquidityAdapter');
    }
  }

  public async getBestQuote(request: QuoteRequest): Promise<Quote> {
    const activeNetwork = getActiveNetworkConfig();

    // Finding 6 Fix: Strict check against active testnet chain ID.
    // Rejects non-testnet and mainnet chain requests completely.
    if (!activeNetwork.isTestnet || request.chainId !== activeNetwork.chainId) {
      throw new RobexAppError(
        'QUOTE_ERROR',
        `Quote requests in Plan 001 are strictly restricted to active testnet (Chain ID ${activeNetwork.chainId}). Chain ID ${request.chainId} is rejected.`,
        { chainId: request.chainId, activeChainId: activeNetwork.chainId }
      );
    }

    // Finding 7 Fix: Validate slippage tolerance (finite, non-negative, and <= 50%)
    if (request.slippageTolerancePercent !== undefined) {
      const s = request.slippageTolerancePercent;
      if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 50) {
        throw new RobexAppError(
          'USER_ERROR',
          `Invalid slippage tolerance: ${s}%. Slippage must be a finite number between 0% and 50%.`,
          { slippage: s }
        );
      }
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

    // Call the primary adapter
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
