export interface RawPoolReserves {
  tokenIn: string;
  tokenOut: string;
  reserveIn: bigint;
  reserveOut: bigint;
  estimatedFeeBps: number;
}

export interface LiquidityProvider {
  id: string;
  name: string;
  getReserves(tokenIn: string, tokenOut: string): Promise<RawPoolReserves>;
}
