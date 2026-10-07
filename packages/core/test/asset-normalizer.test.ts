import { describe, it, expect } from 'vitest';
import type { TokenDefinition } from '@robex/types';
import {
  normalizeAssetBalance,
  formatFinancialNumber,
} from '../src/asset/normalizer.js';

describe('Asset Model & Stock Token Normalization Foundation', () => {
  const ethToken: TokenDefinition = {
    chainId: 46630,
    address: '0x0000000000000000000000000000000000000000',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    assetType: 'NATIVE',
    verified: true,
  };

  const aaplStockToken: TokenDefinition = {
    chainId: 46630,
    address: '0x3333333333333333333333333333333333333333',
    symbol: 'bAAPL',
    name: 'Robinhood Apple Stock Token',
    decimals: 18,
    assetType: 'STOCK_TOKEN',
    verified: true,
    stockMultiplier: 1,
    underlyingTicker: 'AAPL',
  };

  it('normalizes standard 18-decimal token balance', () => {
    // 2.5 ETH in wei
    const rawBalance = 2500000000000000000n;
    const normalized = normalizeAssetBalance(ethToken, rawBalance, 3000);

    expect(normalized.displayBalance).toBe('2.5');
    expect(normalized.valueUsd).toBe(7500);
    expect(normalized.tradability).toBe('TRADEABLE');
  });

  it('correctly calculates stock token multipliers', () => {
    // Fraction stock token representing 10:1 split
    const splitStockToken: TokenDefinition = {
      ...aaplStockToken,
      stockMultiplier: 10,
    };

    // 1 token in wei
    const rawBalance = 1000000000000000000n;
    const normalized = normalizeAssetBalance(splitStockToken, rawBalance, 220);

    expect(normalized.displayBalance).toBe('1');
    // 1 unit * 10 multiplier * $220 = $2200
    expect(normalized.valueUsd).toBe(2200);
  });

  it('formats financial USD currency consistently', () => {
    expect(formatFinancialNumber(12500.5)).toBe('$12,500.50');
  });
});
