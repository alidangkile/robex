import { describe, it, expect } from 'vitest';
import { EXAMPLE_DATA_LABEL, EXAMPLE_MARKETS } from '../src/features/home/sections/exampleData.js';

describe('Home example data', () => {
  it('is clearly labeled as non-live testnet example data', () => {
    expect(EXAMPLE_DATA_LABEL).toContain('EXAMPLE DATA');
    expect(EXAMPLE_DATA_LABEL).toContain('TESTNET');
    expect(EXAMPLE_DATA_LABEL).toContain('NOT LIVE');
  });
  it('has four unique market entries', () => {
    expect(EXAMPLE_MARKETS).toHaveLength(4);
    expect(new Set(EXAMPLE_MARKETS.map((m) => m.pair)).size).toBe(4);
  });
});
