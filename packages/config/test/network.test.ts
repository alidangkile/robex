import { describe, it, expect, vi } from 'vitest';
import {
  getActiveNetworkConfig,
  getNetworkConfig,
  isSupportedChain,
  validateNetworkConfig,
} from '../src/networks/index.js';

const OFFICIAL_TESTNET_RPC_URL = 'https://rpc.testnet.chain.robinhood.com';
const OFFICIAL_TESTNET_EXPLORER_URL = 'https://explorer.testnet.chain.robinhood.com';
const REMOVED_TESTNET_BACKUP_RPC = 'https://rpc-backup.testnet.robinhood.com';

const TESTNET_ENDPOINT_ENV = [
  'ROBINHOOD_TESTNET_RPC_URL',
  'ROBINHOOD_TESTNET_EXPLORER_URL',
] as const;

const MAINNET_ENDPOINT_ENV = [
  'ROBINHOOD_MAINNET_RPC_URL',
  'ROBINHOOD_MAINNET_EXPLORER_URL',
] as const;

function snapshotEnv(keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}



describe('Network Configuration Foundation', () => {
  it('validates active Robinhood Chain Testnet config', () => {
    const config = getActiveNetworkConfig();
    expect(config.chainId).toBe(46630);
    expect(config.isTestnet).toBe(true);
    expect(config.isMainnet).toBe(false);
    expect(config.nativeCurrency.symbol).toBe('ETH');

    const validation = validateNetworkConfig(config);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('correctly identifies supported and unsupported chains', () => {
    expect(isSupportedChain(46630)).toBe(true);
    expect(isSupportedChain(4663)).toBe(true);
    expect(isSupportedChain(46600)).toBe(false);
    expect(isSupportedChain(1)).toBe(false); // Ethereum mainnet not in V1
    expect(getNetworkConfig(999999)).toBeNull();
  });

  it('enforces safety invariant: prevents unintended mainnet activation', () => {
    const originalViteChainId = process.env.VITE_DEFAULT_CHAIN_ID;
    delete process.env.VITE_DEFAULT_CHAIN_ID;
    process.env.DEFAULT_CHAIN_ID = '4663';
    delete process.env.ALLOW_MAINNET;

    expect(() => getActiveNetworkConfig()).toThrow(
      'Security Invariant: Mainnet configuration cannot be activated without explicit ALLOW_MAINNET=true flag'
    );

    delete process.env.DEFAULT_CHAIN_ID;
    if (originalViteChainId !== undefined) {
      process.env.VITE_DEFAULT_CHAIN_ID = originalViteChainId;
    }
  });

  it('confirms mainnet chainId === 4663 and testnet chainId === 46630', () => {
    const mainnetConfig = getNetworkConfig(4663);
    const testnetConfig = getNetworkConfig(46630);

    expect(mainnetConfig).not.toBeNull();
    expect(mainnetConfig?.chainId).toBe(4663);
    expect(mainnetConfig?.isMainnet).toBe(true);
    expect(mainnetConfig?.isTestnet).toBe(false);

    expect(testnetConfig).not.toBeNull();
    expect(testnetConfig?.chainId).toBe(46630);
    expect(testnetConfig?.isTestnet).toBe(true);
    expect(testnetConfig?.isMainnet).toBe(false);

    expect(getNetworkConfig(46600)).toBeNull();
  });
});

describe('Plan 003B Stage A testnet endpoints', () => {
  it('uses the official public RPC and explorer when overrides are absent', async () => {
    const saved = snapshotEnv(TESTNET_ENDPOINT_ENV);
    delete process.env.ROBINHOOD_TESTNET_RPC_URL;
    delete process.env.ROBINHOOD_TESTNET_EXPLORER_URL;

    try {
      vi.resetModules();
      const { ROBINHOOD_TESTNET_CONFIG } = await import('../src/networks/robinhood-testnet.js');

      expect(ROBINHOOD_TESTNET_CONFIG.chainId).toBe(46630);
      expect(ROBINHOOD_TESTNET_CONFIG.providers.rpcUrl).toBe(OFFICIAL_TESTNET_RPC_URL);
      expect(ROBINHOOD_TESTNET_CONFIG.providers.explorerUrl).toBe(OFFICIAL_TESTNET_EXPLORER_URL);
      expect(ROBINHOOD_TESTNET_CONFIG.providers.fallbackRpcUrls).toEqual([]);
      expect(ROBINHOOD_TESTNET_CONFIG.providers.fallbackRpcUrls).not.toContain(REMOVED_TESTNET_BACKUP_RPC);
      expect(ROBINHOOD_TESTNET_CONFIG.blockTimeMs).toBe(2000);
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.multicall).toBe('0x1234567890123456789012345678901234567890');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.routerPlaceholder).toBe('0x0000000000000000000000000000000000000001');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.weth).toBe('0x0000000000000000000000000000000000000002');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.poolManager).toBe('0x8366a39CC670B4001A1121B8F6A443A643e40951');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.stateView).toBe('0xf3334192d15450cdd385c8b70e03f9a6bd9e673b');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.v4Quoter).toBe('0x8dc178efb8111bb0973dd9d722ebeff267c98f94');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.poolId).toBe('0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.usdg).toBe('0x7E955252E15c84f5768B83c41a71F9eba181802F');
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.routerPlaceholder).not.toBe(ROBINHOOD_TESTNET_CONFIG.contracts.v4Quoter);
      expect(ROBINHOOD_TESTNET_CONFIG.contracts.weth).not.toBe('0x7943e237c7F95DA44E0301572D358911207852Fa');
    } finally {
      restoreEnv(saved);
    }
  });

  it('keeps ROBINHOOD_TESTNET_RPC_URL and explorer environment overrides', async () => {
    const saved = snapshotEnv(TESTNET_ENDPOINT_ENV);
    process.env.ROBINHOOD_TESTNET_RPC_URL = 'https://override.example/rpc';
    process.env.ROBINHOOD_TESTNET_EXPLORER_URL = 'https://override.example/explorer';

    try {
      vi.resetModules();
      const { ROBINHOOD_TESTNET_CONFIG } = await import('../src/networks/robinhood-testnet.js');

      expect(ROBINHOOD_TESTNET_CONFIG.providers.rpcUrl).toBe('https://override.example/rpc');
      expect(ROBINHOOD_TESTNET_CONFIG.providers.explorerUrl).toBe('https://override.example/explorer');
      expect(ROBINHOOD_TESTNET_CONFIG.providers.fallbackRpcUrls).toEqual([]);
    } finally {
      restoreEnv(saved);
    }
  });

  it('uses the official documented mainnet chain ID, RPC, and explorer endpoints', async () => {
    const saved = snapshotEnv(MAINNET_ENDPOINT_ENV);
    delete process.env.ROBINHOOD_MAINNET_RPC_URL;
    delete process.env.ROBINHOOD_MAINNET_EXPLORER_URL;

    try {
      vi.resetModules();
      const { ROBINHOOD_MAINNET_CONFIG } = await import('../src/networks/robinhood-mainnet.js');

      expect(ROBINHOOD_MAINNET_CONFIG.chainId).toBe(4663);
      expect(ROBINHOOD_MAINNET_CONFIG.providers.rpcUrl).toBe('https://rpc.mainnet.chain.robinhood.com');
      expect(ROBINHOOD_MAINNET_CONFIG.providers.explorerUrl).toBe('https://robinhoodchain.blockscout.com');
      expect(ROBINHOOD_MAINNET_CONFIG.providers.fallbackRpcUrls).toEqual([]);
      expect(ROBINHOOD_MAINNET_CONFIG.blockTimeMs).toBe(2000);
      expect(ROBINHOOD_MAINNET_CONFIG.contracts).toEqual({
        multicall: undefined,
        routerPlaceholder: undefined,
        weth: undefined,
      });
    } finally {
      restoreEnv(saved);
    }
  });

  it('keeps ROBINHOOD_MAINNET_RPC_URL and explorer environment overrides', async () => {
    const saved = snapshotEnv(MAINNET_ENDPOINT_ENV);
    process.env.ROBINHOOD_MAINNET_RPC_URL = 'https://override-mainnet.example/rpc';
    process.env.ROBINHOOD_MAINNET_EXPLORER_URL = 'https://override-mainnet.example/explorer';

    try {
      vi.resetModules();
      const { ROBINHOOD_MAINNET_CONFIG } = await import('../src/networks/robinhood-mainnet.js');

      expect(ROBINHOOD_MAINNET_CONFIG.chainId).toBe(4663);
      expect(ROBINHOOD_MAINNET_CONFIG.providers.rpcUrl).toBe('https://override-mainnet.example/rpc');
      expect(ROBINHOOD_MAINNET_CONFIG.providers.explorerUrl).toBe('https://override-mainnet.example/explorer');
      expect(ROBINHOOD_MAINNET_CONFIG.providers.fallbackRpcUrls).toEqual([]);
    } finally {
      restoreEnv(saved);
    }
  });
});
