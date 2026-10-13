/**
 * UX-12: Shared Display Formatting Helpers
 *
 * Rules:
 * - ETH amounts (balance, max swappable, cap and error messages): at most 6 decimals,
 *   truncated DOWN (never rounded up), trailing zeros trimmed.
 * - USDG amounts (balance, you receive, minimum received, actual received): at most 4 decimals,
 *   truncated DOWN, trailing zeros trimmed, consistent everywhere.
 * - Non-zero values below the smallest shown unit display as "<0.000001 ETH" / "<0.0001 USDG"
 *   (or "<0.000001" / "<0.0001" if without symbol).
 * - Full-precision value appears in title/tooltip on hover.
 * - Zero displays as "0" (or "0 ETH" / "0 USDG").
 */

export interface FormattedDisplayAmount {
  /**
   * The formatted amount without token symbol.
   * E.g. "1.2345", "<0.0001", "0"
   */
  formatted: string;

  /**
   * The formatted amount with token symbol.
   * E.g. "1.2345 USDG", "<0.0001 USDG", "0 USDG"
   */
  formattedWithSymbol: string;

  /**
   * The full-precision decimal representation without token symbol.
   * E.g. "1.234567", "0.000000759572282608", "0"
   */
  full: string;

  /**
   * The full-precision decimal representation with token symbol.
   * E.g. "1.234567 USDG", "0.000000759572282608 ETH", "0 USDG"
   */
  fullWithSymbol: string;

  /**
   * True if the amount is non-zero and strictly below the smallest shown unit
   * (e.g. <0.000001 for ETH, <0.0001 for USDG).
   */
  isTiny: boolean;

  /**
   * True if the amount is zero.
   */
  isZero: boolean;
}

export interface DisplayFormatOptions {
  /**
   * If true, formatted string includes the token symbol (e.g. "0.5 ETH").
   * Defaults to false.
   */
  includeSymbol?: boolean;
}

export interface AmountFormatConfig {
  decimals: number;
  maxDecimals: number;
  symbol: string;
  includeSymbol?: boolean;
}

function parseDecimalToUnits(str: string, decimals: number): bigint {
  const parts = str.split('.');
  const wholeStr = parts[0] ? parts[0].trim() : '0';
  const fracRaw = parts[1] || '';
  const fracSliced = fracRaw.slice(0, decimals).padEnd(decimals, '0');
  try {
    const wholePart = BigInt(wholeStr);
    const fracPart = fracSliced ? BigInt(fracSliced) : 0n;
    return wholePart * (10n ** BigInt(decimals)) + fracPart;
  } catch {
    return 0n;
  }
}

function trimDecimalString(str: string): string {
  if (!str.includes('.')) return str;
  const [whole, frac] = str.split('.');
  const trimmedFrac = frac.replace(/0+$/, '');
  return trimmedFrac.length > 0 ? `${whole}.${trimmedFrac}` : whole;
}

export function getDisplayAmount(
  value: bigint | string | number | null | undefined,
  config: AmountFormatConfig
): FormattedDisplayAmount {
  const { decimals, maxDecimals, symbol } = config;

  let baseUnits = 0n;
  let fullOverride: string | null = null;

  if (typeof value === 'bigint') {
    baseUnits = value < 0n ? 0n : value;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      baseUnits = 0n;
    } else {
      const str = value.toString();
      if (str.includes('.')) {
        fullOverride = trimDecimalString(str);
        baseUnits = parseDecimalToUnits(str, decimals);
      } else {
        baseUnits = BigInt(str);
      }
    }
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '0' || trimmed === '--') {
      baseUnits = 0n;
    } else if (trimmed.includes('.')) {
      fullOverride = trimDecimalString(trimmed);
      baseUnits = parseDecimalToUnits(trimmed, decimals);
    } else if (/^\d+$/.test(trimmed)) {
      baseUnits = BigInt(trimmed);
    } else {
      baseUnits = 0n;
    }
  }

  const factor = 10n ** BigInt(decimals);
  const whole = baseUnits / factor;
  const frac = baseUnits % factor;
  const fracPadded = frac.toString().padStart(decimals, '0');
  const trimmedFullFrac = fracPadded.replace(/0+$/, '');
  const computedFull = trimmedFullFrac.length > 0 ? `${whole.toString()}.${trimmedFullFrac}` : whole.toString();
  const full = fullOverride ?? computedFull;
  const fullWithSymbol = `${full} ${symbol}`;

  if (baseUnits === 0n) {
    return {
      formatted: '0',
      formattedWithSymbol: `0 ${symbol}`,
      full,
      fullWithSymbol,
      isTiny: false,
      isZero: true,
    };
  }

  // Smallest shown unit threshold in base units: 10^(decimals - maxDecimals)
  const tinyThreshold = 10n ** BigInt(decimals - maxDecimals);
  const minUnitStr = maxDecimals === 0
    ? '1'
    : `0.${'0'.repeat(maxDecimals - 1)}1`;

  if (baseUnits < tinyThreshold) {
    const formatted = `<${minUnitStr}`;
    const formattedWithSymbol = `<${minUnitStr} ${symbol}`;
    return {
      formatted,
      formattedWithSymbol,
      full,
      fullWithSymbol,
      isTiny: true,
      isZero: false,
    };
  }

  // Normal case: truncate DOWN to at most maxDecimals, never round up, trim trailing zeros
  const truncatedFrac = fracPadded.slice(0, maxDecimals);
  const trimmedTruncatedFrac = truncatedFrac.replace(/0+$/, '');
  const formatted = trimmedTruncatedFrac.length > 0
    ? `${whole.toString()}.${trimmedTruncatedFrac}`
    : whole.toString();
  const formattedWithSymbol = `${formatted} ${symbol}`;

  return {
    formatted,
    formattedWithSymbol,
    full,
    fullWithSymbol,
    isTiny: false,
    isZero: false,
  };
}

export function formatDisplayAmount(
  value: bigint | string | number | null | undefined,
  config: AmountFormatConfig
): string {
  const result = getDisplayAmount(value, config);
  return config.includeSymbol ? result.formattedWithSymbol : result.formatted;
}

export const ETH_FORMAT_CONFIG: AmountFormatConfig = {
  decimals: 18,
  maxDecimals: 6,
  symbol: 'ETH',
};

export const USDG_FORMAT_CONFIG: AmountFormatConfig = {
  decimals: 6,
  maxDecimals: 4,
  symbol: 'USDG',
};

/**
 * Formats an ETH amount (wei or decimal string) according to UX-12:
 * - At most 6 decimals, truncated DOWN (never rounded up), trailing zeros trimmed.
 * - Non-zero values below 0.000001 ETH display as "<0.000001 ETH" (or "<0.000001" if without symbol).
 */
export function formatDisplayEth(
  wei: bigint | string | number | null | undefined,
  options?: DisplayFormatOptions
): string {
  const result = getDisplayEth(wei, options);
  return options?.includeSymbol ? result.formattedWithSymbol : result.formatted;
}

/**
 * Returns full details for an ETH amount (wei) including formatted string,
 * full precision string, and whether it is tiny (<0.000001 ETH).
 */
export function getDisplayEth(
  wei: bigint | string | number | null | undefined,
  options?: DisplayFormatOptions
): FormattedDisplayAmount {
  return getDisplayAmount(wei, {
    ...ETH_FORMAT_CONFIG,
    includeSymbol: options?.includeSymbol,
  });
}

/**
 * Formats a USDG amount (base units or decimal string) according to UX-12:
 * - At most 4 decimals, truncated DOWN (never rounded up), trailing zeros trimmed.
 * - Non-zero values below 0.0001 USDG display as "<0.0001 USDG" (or "<0.0001" if without symbol).
 */
export function formatDisplayUsdg(
  baseUnits: bigint | string | number | null | undefined,
  options?: DisplayFormatOptions
): string {
  const result = getDisplayUsdg(baseUnits, options);
  return options?.includeSymbol ? result.formattedWithSymbol : result.formatted;
}

/**
 * Returns full details for a USDG amount including formatted string,
 * full precision string, and whether it is tiny (<0.0001 USDG).
 */
export function getDisplayUsdg(
  baseUnits: bigint | string | number | null | undefined,
  options?: DisplayFormatOptions
): FormattedDisplayAmount {
  return getDisplayAmount(baseUnits, {
    ...USDG_FORMAT_CONFIG,
    includeSymbol: options?.includeSymbol,
  });
}
