import { formatBaseUnits } from './v4-math.js';

/**
 * Quick-fill buttons for the "You pay" field (Plan 003B Amendment 1, §6A, D7).
 * All math is bigint on wei and rounds down. "Max" is the whole balance:
 * 003B sends no transaction, so no gas is reserved here.
 */
export const BALANCE_FILL_PERCENTS = [25, 50, 75, 100] as const;
export type BalanceFillPercent = typeof BALANCE_FILL_PERCENTS[number];

export function percentOfBalanceWei(balanceWei: bigint, percent: BalanceFillPercent): bigint {
  if (typeof balanceWei !== 'bigint' || balanceWei < 0n) {
    throw new Error('Balance must be a non-negative bigint.');
  }
  if (!BALANCE_FILL_PERCENTS.includes(percent)) {
    throw new Error('Unsupported balance percentage.');
  }
  if (percent === 100) return balanceWei;
  return (balanceWei * BigInt(percent)) / 100n;
}

/**
 * Wei to the decimal ETH string typed into the input: up to 18 decimals,
 * no trailing zeros, no exponent, no thousands separator. Round-trips through
 * parseEthAmountInput for any amount under the read-only cap.
 */
export function weiToEthInput(wei: bigint): string {
  if (typeof wei !== 'bigint' || wei < 0n) {
    throw new Error('Amount must be a non-negative bigint.');
  }
  return formatBaseUnits(wei, 18);
}

const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;

/**
 * Parse an EIP-1474 hex quantity (for example an eth_getBalance result).
 * Anything else is rejected rather than guessed.
 */
export function parseHexQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || !HEX_QUANTITY.test(value)) {
    throw new Error('The wallet returned a balance that is not a valid hex quantity.');
  }
  return BigInt(value);
}
