import { describe, expect, it } from 'vitest';
import {
  BALANCE_FILL_PERCENTS,
  parseEthAmountInput,
  parseHexQuantity,
  percentOfBalanceWei,
  weiToEthInput,
} from '../src/index.js';

describe('balance quick-fill math (Amendment 1 §6A, AC-PCT-02/03)', () => {
  it('rounds down with bigint for 10^18 + 3 wei', () => {
    const balance = 1_000_000_000_000_000_003n;
    expect(percentOfBalanceWei(balance, 25)).toBe(250_000_000_000_000_000n);
    expect(percentOfBalanceWei(balance, 50)).toBe(500_000_000_000_000_001n);
    expect(percentOfBalanceWei(balance, 75)).toBe(750_000_000_000_000_002n);
    expect(percentOfBalanceWei(balance, 100)).toBe(balance);
  });

  it('handles 0, 1 and 3 wei', () => {
    expect(BALANCE_FILL_PERCENTS.map((p) => percentOfBalanceWei(0n, p))).toEqual([0n, 0n, 0n, 0n]);
    expect(BALANCE_FILL_PERCENTS.map((p) => percentOfBalanceWei(1n, p))).toEqual([0n, 0n, 0n, 1n]);
    expect(BALANCE_FILL_PERCENTS.map((p) => percentOfBalanceWei(3n, p))).toEqual([0n, 1n, 2n, 3n]);
  });

  it('rejects negative balances and unsupported percentages', () => {
    expect(() => percentOfBalanceWei(-1n, 25)).toThrow();
    expect(() => percentOfBalanceWei(10n, 33 as never)).toThrow();
  });

  it('formats wei as a plain decimal ETH string', () => {
    expect(weiToEthInput(250_000_000_000_000_000n)).toBe('0.25');
    expect(weiToEthInput(1n)).toBe('0.000000000000000001');
    expect(weiToEthInput(100_000_000_000_000n)).toBe('0.0001');
    expect(weiToEthInput(1_000_000_000_000_000_003n)).toBe('1.000000000000000003');
    expect(weiToEthInput(10n ** 30n)).toBe('1000000000000');
    expect(weiToEthInput(0n)).toBe('0');
    for (const text of [weiToEthInput(1n), weiToEthInput(123_456_789n), weiToEthInput(10n ** 30n)]) {
      expect(text).not.toMatch(/e|E|,/);
    }
    expect(() => weiToEthInput(-1n)).toThrow();
  });

  it('round-trips through parseEthAmountInput for every amount under the cap', () => {
    const cases = [1n, 2n, 3n, 759_572_282_608n, 759_572_282_609n, 25_000_000_000_000n, 100_000_000_000_000n];
    for (const balance of [...cases, 1_000_000_000_000_000_003n]) {
      for (const percent of BALANCE_FILL_PERCENTS) {
        const wei = percentOfBalanceWei(balance, percent);
        if (wei === 0n) continue;
        const parsed = parseEthAmountInput(weiToEthInput(wei));
        if (wei <= 100_000_000_000_000n) {
          expect(parsed).toEqual({ status: 'ok', wei: wei.toString() });
        } else {
          expect(parsed).toEqual({ status: 'invalid', message: 'The read-only limit is 0.0001 ETH.' });
        }
      }
    }
  });

  it('round-trips a deterministic sweep of random-looking balances (property style, no new library)', () => {
    let seed = 0x12345678n;
    for (let i = 0; i < 500; i += 1) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
      const balance = seed % 200_000_000_000_000n;
      for (const percent of BALANCE_FILL_PERCENTS) {
        const wei = percentOfBalanceWei(balance, percent);
        expect(wei).toBeLessThanOrEqual(balance);
        expect(wei * 100n).toBeLessThanOrEqual(balance * BigInt(percent));
        expect((wei + 1n) * 100n).toBeGreaterThan(balance * BigInt(percent));
        if (wei > 0n && wei <= 100_000_000_000_000n) {
          expect(parseEthAmountInput(weiToEthInput(wei))).toEqual({ status: 'ok', wei: wei.toString() });
        }
      }
    }
  });

  it('parses only valid hex quantities', () => {
    expect(parseHexQuantity('0x0')).toBe(0n);
    expect(parseHexQuantity('0xde0b6b3a7640000')).toBe(10n ** 18n);
    expect(parseHexQuantity('0xDE0B6B3A7640000')).toBe(10n ** 18n);
    for (const bad of ['0x', '0x00', '0x01', 'de0b', '1000', '', '-0x1', '0xzz', null, undefined, 12, `0x${'f'.repeat(65)}`]) {
      expect(() => parseHexQuantity(bad)).toThrow();
    }
  });
});
