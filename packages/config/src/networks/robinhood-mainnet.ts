import type { NetworkConfig } from '@robex/types';

function getEnvVar(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Mainnet Configuration Schema.
 * INVARIANT: Never activate mainnet automatically or in tests without human authorization.
 */
export const ROBINHOOD_MAINNET_CONFIG: NetworkConfig = {
  chainId: 46600,
  chainName: 'Robinhood Chain Mainnet',
  isTestnet: false,
  isMainnet: true,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  providers: {
    rpcUrl: getEnvVar('ROBINHOOD_MAINNET_RPC_URL') || 'https://rpc.robinhood.com',
    fallbackRpcUrls: [],
    explorerUrl: getEnvVar('ROBINHOOD_MAINNET_EXPLORER_URL') || 'https://explorer.robinhood.com',
  },
  contracts: {
    multicall: undefined,
    routerPlaceholder: undefined,
    weth: undefined,
  },
  blockTimeMs: 2000,
};
