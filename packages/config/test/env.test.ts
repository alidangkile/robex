import { describe, it, expect } from 'vitest';
import { parseAndValidateEnv } from '../src/env/index.js';

describe('Environment Configuration Parser', () => {
  it('parses valid environment variables with defaults', () => {
    const config = parseAndValidateEnv({});
    expect(config.nodeEnv).toBe('development');
    expect(config.robexEnv).toBe('testnet');
    expect(config.apiPort).toBe(3001);
    expect(config.defaultChainId).toBe(46630);
  });

  it('rejects invalid API_PORT values', () => {
    expect(() => parseAndValidateEnv({ API_PORT: 'invalid' })).toThrow();
    expect(() => parseAndValidateEnv({ API_PORT: '-10' })).toThrow();
  });
});
