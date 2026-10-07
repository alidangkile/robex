/**
 * EXAMPLE DATA ONLY — static placeholders for the disconnected home teaser.
 * Not live prices. Replace with real market/pool hooks when they exist.
 */
export interface ExampleMarket {
  pair: string;
  base: { sym: string; color: string };
  quote: { sym: string; color: string };
  price: string;
  metricLabel: '24h' | 'Est. APR';
  metric: string;
  trend: 'up' | 'down';
  tvl: string;
}

export const EXAMPLE_DATA_LABEL = 'EXAMPLE DATA · TESTNET · NOT LIVE';

export const EXAMPLE_MARKETS: ExampleMarket[] = [
  { pair: 'ETH / USDC', base: { sym: 'ETH', color: '#9AA8FF' }, quote: { sym: 'USD', color: '#7FD8C9' }, price: '$3,412.08', metricLabel: '24h', metric: '+2.14%', trend: 'up', tvl: '$1.28M' },
  { pair: 'tTSLA / USDC', base: { sym: 'TSL', color: '#F5C66B' }, quote: { sym: 'USD', color: '#7FD8C9' }, price: '$248.61', metricLabel: '24h', metric: '−0.87%', trend: 'down', tvl: '$412.5K' },
  { pair: 'tAAPL / USDC', base: { sym: 'AAP', color: '#C6B5FF' }, quote: { sym: 'USD', color: '#7FD8C9' }, price: '$227.30', metricLabel: '24h', metric: '+0.42%', trend: 'up', tvl: '$389.0K' },
  { pair: 'ETH / tTSLA', base: { sym: 'ETH', color: '#9AA8FF' }, quote: { sym: 'TSL', color: '#F5C66B' }, price: '13.72', metricLabel: 'Est. APR', metric: '18.6%', trend: 'up', tvl: '$96.4K' },
];
