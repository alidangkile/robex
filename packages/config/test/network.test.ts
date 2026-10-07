import { describe, it, expect } from 'vitest';
import {
  getActiveNetworkConfig,
  getNetworkConfig,
  isSupportedChain,
  validateNetworkConfig,
} from '../src/networks/index.js';

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
    expect(isSupportedChain(46600)).toBe(true);
    expect(isSupportedChain(1)).toBe(false); // Ethereum mainnet not in V1
    expect(getNetworkConfig(999999)).toBeNull();
  });

  it('enforces safety invariant: prevents unintended mainnet activation', () => {
    process.env.DEFAULT_CHAIN_ID = '46600';
    delete process.env.ALLOW_MAINNET;

    expect(() => getActiveNetworkConfig()).toThrow(
      'Security Invariant: Mainnet configuration cannot be activated without explicit ALLOW_MAINNET=true flag'
    );

    delete process.env.DEFAULT_CHAIN_ID;
  });
});
