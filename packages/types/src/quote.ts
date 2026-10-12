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
  /**
   * Milliseconds of the 20 s block window left when the server finished the
   * read (expiresAt - server clock at completion, clamped to 0..20000). The
   * client never shows a quote longer than this (QA F-15).
   */
  remainingMs?: number;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  tokenInDecimals?: number;
  tokenOutDecimals?: number;
  poolId?: string;
  capWei?: string;
  limitations?: string[];
}
