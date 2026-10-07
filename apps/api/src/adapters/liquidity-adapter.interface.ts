import type { Quote, QuoteRequest, RouteSource } from '@robex/types';

export interface LiquidityAdapter {
  id: string;
  source: RouteSource;
  getQuote(request: QuoteRequest): Promise<Quote>;
}
