import type { NetworkConfig } from '@robex/types';

function getEnvVar(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

export const ROBINHOOD_TESTNET_CONFIG: NetworkConfig = {
  chainId: 46630,
  chainName: 'Robinhood Chain Testnet',
  isTestnet: true,
  isMainnet: false,
  nativeCurrency: {
    name: 'Testnet Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  providers: {
    rpcUrl: getEnvVar('ROBINHOOD_TESTNET_RPC_URL') || 'https://rpc.testnet.chain.robinhood.com',
    fallbackRpcUrls: [],
    explorerUrl: getEnvVar('ROBINHOOD_TESTNET_EXPLORER_URL') || 'https://explorer.testnet.chain.robinhood.com',
  },
  contracts: {
    multicall: '0x1234567890123456789012345678901234567890',
    routerPlaceholder: '0x0000000000000000000000000000000000000001',
    weth: '0x0000000000000000000000000000000000000002',
  },
  blockTimeMs: 2000,
};
