export type ChainId = number;

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface NetworkContracts {
  multicall?: string;
  routerPlaceholder?: string;
  weth?: string;
}

export interface NetworkProviders {
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  explorerUrl: string;
}

export interface NetworkConfig {
  chainId: ChainId;
  chainName: string;
  isTestnet: boolean;
  isMainnet: boolean;
  nativeCurrency: NativeCurrency;
  providers: NetworkProviders;
  contracts: NetworkContracts;
  blockTimeMs: number;
}
