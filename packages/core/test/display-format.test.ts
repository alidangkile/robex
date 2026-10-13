import { describe, expect, it } from 'vitest';
import {
  formatDisplayAmount,
  formatDisplayEth,
  formatDisplayUsdg,
  getDisplayAmount,
  getDisplayEth,
  getDisplayUsdg,
} from '../src/quote/display-format.js';

describe('UX-12 display-format helper', () => {
  describe('ETH formatting (at most 6 decimals, truncated down, trimmed)', () => {
    it('truncation never rounds up', () => {
      // 0.000001999999 ETH -> 0.000001 (must NOT round to 0.000002)
      const wei1 = 1_000_001_999_999n;
      expect(formatDisplayEth(wei1)).toBe('0.000001');

      // 1.999999999999 ETH -> 1.999999 (must NOT round to 2)
      const wei2 = 1_999_999_999_999_000_000n;
      expect(formatDisplayEth(wei2)).toBe('1.999999');

      // 0.000009999 ETH -> 0.000009 (never 0.00001)
      const wei3 = 9_999_000_000_000n;
      expect(formatDisplayEth(wei3)).toBe('0.000009');
    });

    it('trims trailing zeros cleanly', () => {
      // 1.500000000 ETH -> 1.5
      expect(formatDisplayEth(1_500_000_000_000_000_000n)).toBe('1.5');

      // 1.050000000 ETH -> 1.05
      expect(formatDisplayEth(1_050_000_000_000_000_000n)).toBe('1.05');

      // Exactly 2 ETH -> 2 (no trailing dot or zeros)
      expect(formatDisplayEth(2_000_000_000_000_000_000n)).toBe('2');

      // 0.000100 ETH -> 0.0001
      expect(formatDisplayEth(100_000_000_000_000n)).toBe('0.0001');
    });

    it('handles the tiny-value case below 0.000001 ETH', () => {
      // 1 wei (0.000000000000000001 ETH)
      const tiny1 = getDisplayEth(1n);
      expect(tiny1.formatted).toBe('<0.000001');
      expect(tiny1.formattedWithSymbol).toBe('<0.000001 ETH');
      expect(tiny1.isTiny).toBe(true);
      expect(tiny1.full).toBe('0.000000000000000001');
      expect(tiny1.fullWithSymbol).toBe('0.000000000000000001 ETH');

      // Historical active pool cap: 759572282608 wei (~0.000000759572282608 ETH)
      const poolCap = getDisplayEth(759_572_282_608n);
      expect(poolCap.formatted).toBe('<0.000001');
      expect(poolCap.formattedWithSymbol).toBe('<0.000001 ETH');
      expect(poolCap.isTiny).toBe(true);
      expect(poolCap.full).toBe('0.000000759572282608');
      expect(poolCap.fullWithSymbol).toBe('0.000000759572282608 ETH');

      // Boundary check: exactly 10^12 wei (0.000001 ETH) is NOT tiny
      const boundary = getDisplayEth(1_000_000_000_000n);
      expect(boundary.formatted).toBe('0.000001');
      expect(boundary.isTiny).toBe(false);

      // Boundary - 1 wei (999_999_999_999 wei) IS tiny
      const justUnder = getDisplayEth(999_999_999_999n);
      expect(justUnder.formatted).toBe('<0.000001');
      expect(justUnder.isTiny).toBe(true);
    });

    it('handles zero correctly', () => {
      const zero = getDisplayEth(0n);
      expect(zero.formatted).toBe('0');
      expect(zero.formattedWithSymbol).toBe('0 ETH');
      expect(zero.full).toBe('0');
      expect(zero.fullWithSymbol).toBe('0 ETH');
      expect(zero.isZero).toBe(true);
      expect(zero.isTiny).toBe(false);

      expect(formatDisplayEth(0n)).toBe('0');
      expect(formatDisplayEth(0n, { includeSymbol: true })).toBe('0 ETH');
      expect(formatDisplayEth('0')).toBe('0');
    });

    it('formats large values without overflow or scientific notation', () => {
      // 1,234,567.890123456789 ETH
      const largeWei = 1_234_567_890_123_456_789_000_000n;
      const res = getDisplayEth(largeWei);
      expect(res.formatted).toBe('1234567.890123');
      expect(res.formattedWithSymbol).toBe('1234567.890123 ETH');
      expect(res.full).toBe('1234567.890123456789');
      expect(res.fullWithSymbol).toBe('1234567.890123456789 ETH');
    });

    it('accepts decimal string inputs and raw string inputs', () => {
      // Decimal string
      expect(formatDisplayEth('0.000000759572282608', { includeSymbol: true })).toBe('<0.000001 ETH');
      expect(formatDisplayEth('0.0001')).toBe('0.0001');
      expect(formatDisplayEth('1.5000000000')).toBe('1.5');

      // Integer string (wei)
      expect(formatDisplayEth('759572282608', { includeSymbol: true })).toBe('<0.000001 ETH');
      expect(formatDisplayEth('100000000000000')).toBe('0.0001');
    });
  });

  describe('USDG formatting (at most 4 decimals, truncated down, trimmed)', () => {
    it('truncation never rounds up', () => {
      // 1122 units = 0.001122 USDG -> 0.0011 (never rounds up to 0.0012)
      expect(formatDisplayUsdg(1122n)).toBe('0.0011');

      // 0.000199 USDG (199 units) -> 0.0001 (never rounds up to 0.0002)
      expect(formatDisplayUsdg(199n)).toBe('0.0001');

      // 5.999999 USDG (5_999_999 units) -> 5.9999 (never rounds up to 6.0)
      expect(formatDisplayUsdg(5_999_999n)).toBe('5.9999');
    });

    it('trims trailing zeros cleanly', () => {
      // 1.2000 USDG (1_200_000 units) -> 1.2
      expect(formatDisplayUsdg(1_200_000n)).toBe('1.2');

      // 1.0500 USDG (1_050_000 units) -> 1.05
      expect(formatDisplayUsdg(1_050_000n)).toBe('1.05');

      // 500 USDG (500_000_000 units) -> 500
      expect(formatDisplayUsdg(500_000_000n)).toBe('500');
    });

    it('handles the tiny-value case below 0.0001 USDG', () => {
      // 1 raw unit = 0.000001 USDG
      const tiny1 = getDisplayUsdg(1n);
      expect(tiny1.formatted).toBe('<0.0001');
      expect(tiny1.formattedWithSymbol).toBe('<0.0001 USDG');
      expect(tiny1.isTiny).toBe(true);
      expect(tiny1.full).toBe('0.000001');
      expect(tiny1.fullWithSymbol).toBe('0.000001 USDG');

      // 50 raw units = 0.00005 USDG
      const tiny50 = getDisplayUsdg(50n);
      expect(tiny50.formatted).toBe('<0.0001');
      expect(tiny50.formattedWithSymbol).toBe('<0.0001 USDG');
      expect(tiny50.isTiny).toBe(true);
      expect(tiny50.full).toBe('0.00005');
      expect(tiny50.fullWithSymbol).toBe('0.00005 USDG');

      // Boundary check: 100 raw units = 0.0001 USDG is NOT tiny
      const boundary = getDisplayUsdg(100n);
      expect(boundary.formatted).toBe('0.0001');
      expect(boundary.isTiny).toBe(false);

      // Boundary - 1 unit (99 raw units = 0.000099 USDG) IS tiny
      const under = getDisplayUsdg(99n);
      expect(under.formatted).toBe('<0.0001');
      expect(under.isTiny).toBe(true);
    });

    it('handles zero correctly', () => {
      const zero = getDisplayUsdg(0n);
      expect(zero.formatted).toBe('0');
      expect(zero.formattedWithSymbol).toBe('0 USDG');
      expect(zero.full).toBe('0');
      expect(zero.isZero).toBe(true);
      expect(zero.isTiny).toBe(false);

      expect(formatDisplayUsdg(0n)).toBe('0');
      expect(formatDisplayUsdg(0n, { includeSymbol: true })).toBe('0 USDG');
    });

    it('formats large values without overflow', () => {
      // 10,000,000.123456 USDG
      const large = 10_000_000_123_456n;
      const res = getDisplayUsdg(large);
      expect(res.formatted).toBe('10000000.1234');
      expect(res.formattedWithSymbol).toBe('10000000.1234 USDG');
      expect(res.full).toBe('10000000.123456');
    });

    it('accepts raw string units and decimal strings', () => {
      expect(formatDisplayUsdg('1122')).toBe('0.0011');
      expect(formatDisplayUsdg('50', { includeSymbol: true })).toBe('<0.0001 USDG');
      expect(formatDisplayUsdg('0.00005', { includeSymbol: true })).toBe('<0.0001 USDG');
      expect(formatDisplayUsdg('1.2500')).toBe('1.25');
    });
  });

  describe('generic formatDisplayAmount', () => {
    it('respects arbitrary decimals and maxDecimals configurations', () => {
      const formatted = formatDisplayAmount(12345678n, {
        decimals: 6,
        maxDecimals: 2,
        symbol: 'TOKEN',
        includeSymbol: true,
      });
      // 12.345678 -> 12.34 TOKEN
      expect(formatted).toBe('12.34 TOKEN');

      const details = getDisplayAmount(12345678n, {
        decimals: 6,
        maxDecimals: 2,
        symbol: 'TOKEN',
      });
      expect(details.formatted).toBe('12.34');
      expect(details.formattedWithSymbol).toBe('12.34 TOKEN');
      expect(details.full).toBe('12.345678');
      expect(details.fullWithSymbol).toBe('12.345678 TOKEN');
      expect(details.isTiny).toBe(false);
    });
  });
});
