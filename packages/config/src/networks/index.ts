import type { ChainId, NetworkConfig } from '@robex/types';
import { ROBINHOOD_TESTNET_CONFIG } from './robinhood-testnet.js';
import { ROBINHOOD_MAINNET_CONFIG } from './robinhood-mainnet.js';

export * from './robinhood-testnet.js';
export * from './robinhood-mainnet.js';
export * from './uniswap-v4-testnet-quote.js';

export const SUPPORTED_NETWORKS: Record<ChainId, NetworkConfig> = {
  [ROBINHOOD_TESTNET_CONFIG.chainId]: ROBINHOOD_TESTNET_CONFIG,
  [ROBINHOOD_MAINNET_CONFIG.chainId]: ROBINHOOD_MAINNET_CONFIG,
};

function getEnvVar(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Returns the active network configuration.
 * By design, Testnet is always active in V1/Plan 001.
 */
export function getActiveNetworkConfig(): NetworkConfig {
  const envChainId = getEnvVar('VITE_DEFAULT_CHAIN_ID') || getEnvVar('DEFAULT_CHAIN_ID');
  if (envChainId) {
    const parsed = Number(envChainId);
    if (parsed === ROBINHOOD_MAINNET_CONFIG.chainId) {
      // Invariant check: Prevent unintended mainnet usage
      if (getEnvVar('ALLOW_MAINNET') !== 'true') {
        throw new Error(
          'Security Invariant: Mainnet configuration cannot be activated without explicit ALLOW_MAINNET=true flag'
        );
      }
      return ROBINHOOD_MAINNET_CONFIG;
    }
    if (SUPPORTED_NETWORKS[parsed]) {
      return SUPPORTED_NETWORKS[parsed];
    }
  }
  return ROBINHOOD_TESTNET_CONFIG;
}

export function getNetworkConfig(chainId: ChainId): NetworkConfig | null {
  return SUPPORTED_NETWORKS[chainId] || null;
}

export function isSupportedChain(chainId: ChainId): boolean {
  return chainId in SUPPORTED_NETWORKS;
}

export function validateNetworkConfig(config: NetworkConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.chainId || typeof config.chainId !== 'number' || config.chainId <= 0) {
    errors.push('Invalid or missing chainId');
  }
  if (!config.chainName || typeof config.chainName !== 'string') {
    errors.push('Invalid or missing chainName');
  }
  if (!config.nativeCurrency || !config.nativeCurrency.symbol || config.nativeCurrency.decimals !== 18) {
    errors.push('Invalid nativeCurrency specification');
  }
  if (!config.providers || !config.providers.rpcUrl || !config.providers.explorerUrl) {
    errors.push('Missing rpcUrl or explorerUrl in providers');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
