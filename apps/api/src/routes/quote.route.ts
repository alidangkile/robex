import { Router } from 'express';
import type { QuoteRequest } from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';
import { QuoteService } from '../services/quote.service.js';
import { ConstantProductLiquidityAdapter } from '../adapters/uniswap-v2-adapter.js';
import { MockRpcLiquidityProvider } from '../providers/mock-rpc-liquidity-provider.js';

export const quoteRouter = Router();

// Setup the call path: Feature -> Service -> Adapter -> Provider
const mockProvider = new MockRpcLiquidityProvider();
const constantProductAdapter = new ConstantProductLiquidityAdapter(mockProvider);
const quoteService = new QuoteService([constantProductAdapter]);

quoteRouter.get('/api/v1/network', (_req, res) => {
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

quoteRouter.get('/api/v1/quote', async (req, res, next) => {
  try {
    const activeNetwork = getActiveNetworkConfig();
    const chainId = req.query.chainId ? parseInt(req.query.chainId as string, 10) : activeNetwork.chainId;
    const tokenIn = (req.query.tokenIn as string) || '0x0000000000000000000000000000000000000000'; // Native ETH placeholder
    const tokenOut = (req.query.tokenOut as string) || '0x1111111111111111111111111111111111111111'; // Mock USDC
    const amountIn = (req.query.amountIn as string) || '1000000000000000000'; // 1 ETH in wei
    const slippageTolerancePercent = req.query.slippage
      ? parseFloat(req.query.slippage as string)
      : 0.5;

    const quoteRequest: QuoteRequest = {
      chainId,
      tokenIn,
      tokenOut,
      amountIn,
      slippageTolerancePercent,
    };

    const quote = await quoteService.getBestQuote(quoteRequest);
    res.json({ quote });
  } catch (err) {
    next(err);
  }
});
