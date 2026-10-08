export interface RouteSource {
  id: string;
  name: string;
  type: 'AMM_V2' | 'AMM_V3' | 'RFQ' | 'SIMULATED' | 'SIMULATED_FOUNDATION' | 'UNISWAP_V4';
}

export interface QuoteRequest {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerancePercent?: number;
  slippageBps?: number;
  recipient?: string;
}

export interface Quote {
  id: string;
  source: RouteSource;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  expectedAmountOut: string;
  minimumAmountOut: string;
  priceImpactPercent: number;
  expiresAt: number;
  risk?: 'normal' | 'warning';
  slippageBps?: number;
  poolFeePips?: number;
  referenceAmountOut?: string;
  referenceRate?: string;
  priceImpactPercentExact?: string;
  blockNumber?: string;
  blockHash?: string;
  blockTimestamp?: string;
  quotedAt?: number;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  tokenInDecimals?: number;
  tokenOutDecimals?: number;
  poolId?: string;
  limitations?: string[];
}
