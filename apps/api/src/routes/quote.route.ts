import { Router } from 'express';
import type { QuoteRequest } from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';
import { RobexAppError } from '@robex/core';
import { QuoteService } from '../services/quote.service.js';
import { UniswapV4ReadOnlyAdapter, type DiagnosticLogger, type V4QuotePins } from '../adapters/uniswap-v4-readonly-adapter.js';
import { JsonRpcReadOnlyProvider, type ReadOnlyRpc } from '../providers/read-only-json-rpc.js';

export interface QuoteRouterOptions {
  rpc?: ReadOnlyRpc;
  pins?: V4QuotePins;
  now?: () => number;
  logger?: DiagnosticLogger;
  diagnosticsEnabled?: () => boolean;
}

function requiredString(value: unknown, name: string): string {
  if (Array.isArray(value) || typeof value !== 'string' || value.trim() === '') {
    throw new RobexAppError('USER_ERROR', `${name} is required`);
  }
  return value.trim();
}

export function parseSlippageQuery(value: unknown): { bps: number; percent: number } {
  if (Array.isArray(value)) {
    throw new RobexAppError('USER_ERROR', 'Invalid slippage tolerance. Use 0 to 50 with at most 2 decimal places.');
  }
  const raw = value === undefined ? '0.5' : value;
  if (typeof raw !== 'string' || !/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(raw)) {
    throw new RobexAppError('USER_ERROR', `Invalid slippage tolerance: ${String(raw)}. Use 0 to 50 with at most 2 decimal places.`);
  }
  const [whole, fraction = ''] = raw.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bps > 5000) {
    throw new RobexAppError('USER_ERROR', `Invalid slippage tolerance: ${raw}%. Slippage must be a finite number between 0% and 50%.`);
  }
  return { bps, percent: bps / 100 };
}

export function parseLiveQuoteQuery(query: Record<string, unknown>, activeChainId: number): QuoteRequest {
  const tokenIn = requiredString(query.tokenIn, 'tokenIn');
  const tokenOut = requiredString(query.tokenOut, 'tokenOut');
  const amountIn = requiredString(query.amountIn, 'amountIn');
  if (!/^(?:0|[1-9]\d*)$/.test(amountIn)) {
    throw new RobexAppError('USER_ERROR', 'amountIn must be a positive integer string in ETH base units');
  }
  const slippage = parseSlippageQuery(query.slippage);
  let chainId = activeChainId;
  if (query.chainId !== undefined) {
    const rawChainId = requiredString(query.chainId, 'chainId');
    if (!/^[1-9]\d*$/.test(rawChainId)) {
      throw new RobexAppError('USER_ERROR', 'chainId must be a positive integer');
    }
    chainId = Number(rawChainId);
  }
  return {
    chainId,
    tokenIn,
    tokenOut,
    amountIn,
    slippageTolerancePercent: slippage.percent,
    slippageBps: slippage.bps,
  };
}

export function createQuoteRouter(options: QuoteRouterOptions = {}): Router {
  const router = Router();
  const activeAtStartup = getActiveNetworkConfig();
  const rpc = options.rpc ?? new JsonRpcReadOnlyProvider(activeAtStartup.providers.rpcUrl);
  const quoteService = new QuoteService([new UniswapV4ReadOnlyAdapter(
    rpc,
    options.pins,
    options.now,
    options.logger,
    undefined,
    options.diagnosticsEnabled,
  )]);

  router.get('/api/v1/network', (_req, res) => {
    const activeNetwork = getActiveNetworkConfig();
    res.json({
      network: {
        chainId: activeNetwork.chainId,
        chainName: activeNetwork.chainName,
        isTestnet: activeNetwork.isTestnet,
        nativeCurrency: activeNetwork.nativeCurrency,
        explorerUrl: activeNetwork.providers.explorerUrl,
      },
    });
  });

  router.get('/api/v1/quote', async (req, res, next) => {
    try {
      const activeNetwork = getActiveNetworkConfig();
      const quoteRequest = parseLiveQuoteQuery(req.query as Record<string, unknown>, activeNetwork.chainId);
      const quote = await quoteService.getBestQuote(quoteRequest);
      res.json({ quote });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
