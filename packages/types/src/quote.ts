export interface RouteSource {
  id: string;
  name: string;
  type: 'AMM_V2' | 'AMM_V3' | 'RFQ' | 'SIMULATED' | 'SIMULATED_FOUNDATION';
}

export interface QuoteRequest {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerancePercent?: number;
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
  // Note: rawCalldata and estimatedGas are omitted in Plan 001 simulated quotes to prevent fake execution claims
}
