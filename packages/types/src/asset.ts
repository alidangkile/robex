export type AssetType =
  | 'NATIVE'
  | 'ERC20'
  | 'STABLECOIN'
  | 'STOCK_TOKEN'
  | 'ETF_TOKEN';

export type DataConfidence =
  | 'VERIFIED_ONCHAIN'
  | 'INDEXED'
  | 'ESTIMATED'
  | 'STALE'
  | 'UNAVAILABLE';

export interface TokenDefinition {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  assetType: AssetType;
  logoUrl?: string;
  verified: boolean;
  stockMultiplier?: number;
  underlyingTicker?: string;
}

export interface TokenBalance {
  token: TokenDefinition;
  rawBalance: string;
  formattedBalance: string;
  confidence: DataConfidence;
  updatedAt: number;
}

export interface NormalizedAsset {
  token: TokenDefinition;
  displaySymbol: string;
  displayBalance: string;
  referencePriceUsd?: number;
  valueUsd?: number;
  tradability: 'TRADEABLE' | 'RESTRICTED' | 'UNSUPPORTED';
  confidence: DataConfidence;
}
