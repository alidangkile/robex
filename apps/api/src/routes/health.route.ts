import { Router } from 'express';
import { getActiveNetworkConfig } from '@robex/config';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/health', (_req, res) => {
  const activeNetwork = getActiveNetworkConfig();

  res.status(200).json({
    status: 'ok',
    service: 'robex-api',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: Date.now(),
    network: {
      chainId: activeNetwork.chainId,
      chainName: activeNetwork.chainName,
      isTestnet: activeNetwork.isTestnet,
    },
  });
});
