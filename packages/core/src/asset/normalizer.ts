import type {
  DataConfidence,
  NormalizedAsset,
  TokenDefinition,
} from '@robex/types';

export function normalizeAssetBalance(
  token: TokenDefinition,
  rawBalanceBigInt: bigint,
  referencePriceUsd?: number,
  confidence: DataConfidence = 'VERIFIED_ONCHAIN'
): NormalizedAsset {
  const divisor = BigInt(10) ** BigInt(token.decimals);
  const integerPart = rawBalanceBigInt / divisor;
  const remainder = rawBalanceBigInt % divisor;

  // Format remainder padded to decimals
  const remainderStr = remainder.toString().padStart(token.decimals, '0');
  // Trim trailing zeros for display, up to 6 decimals
  const trimmedDecimals = remainderStr.slice(0, 6).replace(/0+$/, '');
  const displayBalance = trimmedDecimals.length > 0
    ? `${integerPart.toString()}.${trimmedDecimals}`
    : integerPart.toString();

  // Stock multiplier calculation:
  // If a stock token has a 10:1 split multiplier or fractional representation, apply multiplier
  const effectiveMultiplier = token.stockMultiplier ?? 1;
  const numericUnits = Number(displayBalance) * effectiveMultiplier;

  const valueUsd = referencePriceUsd !== undefined
    ? numericUnits * referencePriceUsd
    : undefined;

  return {
    token,
    displaySymbol: token.symbol,
    displayBalance,
    referencePriceUsd,
    valueUsd,
    tradability: token.verified ? 'TRADEABLE' : 'RESTRICTED',
    confidence,
  };
}

export function formatFinancialNumber(
  value: number,
  currency: 'USD' | 'TOKEN' = 'USD'
): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
  }).format(value);
}
