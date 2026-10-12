import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ROBINHOOD_TESTNET_CONFIG,
  UNISWAP_V4_TESTNET_QUOTE,
} from '../src/networks/index.js';

/**
 * Pinned address constants baseline for Robinhood Chain Testnet (Chain ID 46630).
 *
 * RULES (.agents/rules/00-truthfulness.md):
 * 1. Values in this table must be copied directly from `packages/config` without retyping.
 * 2. Every entry must cite its verified on-chain provenance (Plan 003A/003B/004/R1 or RPC block).
 * 3. Placeholders must be explicitly labelled and proven not to conflict with real runtime addresses.
 */
export const PINNED_ADDRESSES = {
  /**
   * Official Paxos Global Dollar (USDG) token on Robinhood Chain Testnet (46630).
   * Proven in plans/003a-swap-discovery.md §9.3, plans/003b-live-readonly-swap-quote.md §2,
   * and plans/r1-testnet-usdg-source.md §3 (ERC1967Proxy verified on Blockscout at block 132894582).
   */
  usdg: '0x7E955252E15c84f5768B83c41a71F9eba181802F',

  /**
   * Uniswap v4 PoolManager singleton contract on 46630.
   * Proven in plans/003a-swap-discovery.md §8.2, plans/003b-live-readonly-swap-quote.md §2,
   * plans/004-c0-execution-discovery.md §3 and §5.1.
   * Bytecode re-read at block 130884439 per packages/config/src/networks/uniswap-v4-testnet-quote.ts.
   */
  poolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',

  /**
   * Uniswap v4 StateView lens contract on 46630.
   * Proven in plans/003a-swap-discovery.md §8.2, plans/003b-live-readonly-swap-quote.md §2.
   * Bytecode re-read at block 130884439 per packages/config/src/networks/uniswap-v4-testnet-quote.ts.
   */
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',

  /**
   * Uniswap v4 V4Quoter readonly lens contract on 46630.
   * Proven in plans/003a-swap-discovery.md §8.2, plans/003b-live-readonly-swap-quote.md §2.
   * Bytecode re-read at block 130884439 per packages/config/src/networks/uniswap-v4-testnet-quote.ts.
   */
  v4Quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',

  /**
   * Uniswap Universal Router contract on 46630.
   * Proven in plans/004-c0-execution-discovery.md §2, §3.1, §3.2, §3.3, §4.1, §4.3, §6.1, and §7.
   * Codehash 0xfdd90802f39ce5fc8bac4c2f1b3ac7bac530fd17ff46b0630f1bd00f1e14082f at block 132839144 per plans/004 §3.1.
   */
  universalRouter: '0x8876789976decbfcbbbe364623c63652db8c0904',

  /**
   * Official allowlisted testnet WETH token on 46630.
   * Proven in plans/003a-swap-discovery.md §5.3, §9.2, §14, plans/003b-live-readonly-swap-quote.md §2,
   * and plans/004-c0-execution-discovery.md §3.
   */
  wethAllowlisted: '0x7943e237c7F95DA44E0301572D358911207852Fa',

  /**
   * Uniswap v4 Native ETH currency representation address(0).
   * Proven in plans/003a-swap-discovery.md §10, §14, §17, plans/003b-live-readonly-swap-quote.md §2,
   * and plans/004-c0-execution-discovery.md §4, §5.1.
   */
  nativeEth: '0x0000000000000000000000000000000000000000',

  /**
   * Uniswap v4 Pool hooks sentinel address(0) for unhooked ETH/USDG 3000 pool.
   * Proven in plans/003a-swap-discovery.md §10, §17, plans/003b-live-readonly-swap-quote.md §2,
   * and plans/004-c0-execution-discovery.md §4, §5.1.
   */
  hooksZero: '0x0000000000000000000000000000000000000000',

  /**
   * Pinned pool ID (bytes32 keccak256 hash) for ETH/USDG fee 3000 tickSpacing 60 pool.
   * Proven in plans/003a-swap-discovery.md §10, §11, §14, §17, plans/003b-live-readonly-swap-quote.md §2,
   * and plans/004-c0-execution-discovery.md §5.1.
   */
  poolId: '0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669',

  /**
   * PLACEHOLDER: Multicall contract address (currently lines 27-29; value introduced in commit 0167e7c
   * implementing Plan 001 foundation in packages/config/src/networks/robinhood-testnet.ts, analyzed in plans/003a-swap-discovery.md §5.3).
   * Invariant: Must NEVER match any real production contract.
   */
  placeholderMulticall: '0x1234567890123456789012345678901234567890',

  /**
   * PLACEHOLDER: Router placeholder address (currently lines 27-29; value introduced in commit 0167e7c
   * implementing Plan 001 foundation in packages/config/src/networks/robinhood-testnet.ts, analyzed in plans/003a-swap-discovery.md §5.3).
   * Invariant: Must NEVER match any real production contract.
   */
  placeholderRouter: '0x0000000000000000000000000000000000000001',

  /**
   * PLACEHOLDER: WETH placeholder address in contracts map (currently lines 27-29; value introduced in commit 0167e7c
   * implementing Plan 001 foundation in packages/config/src/networks/robinhood-testnet.ts, analyzed in plans/003a-swap-discovery.md §5.3).
   * Invariant: Must NEVER match any real production contract.
   */
  placeholderWeth: '0x0000000000000000000000000000000000000002',
} as const;

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_HEX_REGEX = /^0x[0-9a-fA-F]{64}$/;

describe('Guardrails G1: Machine checks against invented addresses (pinned-addresses.test.ts)', () => {
  describe('1. Exact character-by-character address pinning (case-insensitive)', () => {
    it('pins UNISWAP_V4_TESTNET_QUOTE addresses exactly against the reference constants', () => {
      expect(UNISWAP_V4_TESTNET_QUOTE.usdg.toLowerCase()).toBe(PINNED_ADDRESSES.usdg.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.poolManager.toLowerCase()).toBe(PINNED_ADDRESSES.poolManager.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.stateView.toLowerCase()).toBe(PINNED_ADDRESSES.stateView.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.v4Quoter.toLowerCase()).toBe(PINNED_ADDRESSES.v4Quoter.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.universalRouter.toLowerCase()).toBe(PINNED_ADDRESSES.universalRouter.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.weth.toLowerCase()).toBe(PINNED_ADDRESSES.wethAllowlisted.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.nativeEth.toLowerCase()).toBe(PINNED_ADDRESSES.nativeEth.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.hooks.toLowerCase()).toBe(PINNED_ADDRESSES.hooksZero.toLowerCase());
      expect(UNISWAP_V4_TESTNET_QUOTE.poolId.toLowerCase()).toBe(PINNED_ADDRESSES.poolId.toLowerCase());
    });

    it('pins ROBINHOOD_TESTNET_CONFIG.contracts exactly against the reference constants', () => {
      const { contracts } = ROBINHOOD_TESTNET_CONFIG;
      expect(contracts.usdg?.toLowerCase()).toBe(PINNED_ADDRESSES.usdg.toLowerCase());
      expect(contracts.poolManager?.toLowerCase()).toBe(PINNED_ADDRESSES.poolManager.toLowerCase());
      expect(contracts.stateView?.toLowerCase()).toBe(PINNED_ADDRESSES.stateView.toLowerCase());
      expect(contracts.v4Quoter?.toLowerCase()).toBe(PINNED_ADDRESSES.v4Quoter.toLowerCase());
      expect(contracts.poolId?.toLowerCase()).toBe(PINNED_ADDRESSES.poolId.toLowerCase());
      expect(contracts.universalRouter?.toLowerCase()).toBe(PINNED_ADDRESSES.universalRouter.toLowerCase());
      expect(contracts.multicall?.toLowerCase()).toBe(PINNED_ADDRESSES.placeholderMulticall.toLowerCase());
      expect(contracts.routerPlaceholder?.toLowerCase()).toBe(PINNED_ADDRESSES.placeholderRouter.toLowerCase());
      expect(contracts.weth?.toLowerCase()).toBe(PINNED_ADDRESSES.placeholderWeth.toLowerCase());
    });

    it('exhaustively pins all address/poolId keys in ROBINHOOD_TESTNET_CONFIG.contracts and UNISWAP_V4_TESTNET_QUOTE', () => {
      const expectedContractKeys = [
        'multicall',
        'poolId',
        'poolManager',
        'routerPlaceholder',
        'stateView',
        'universalRouter',
        'usdg',
        'v4Quoter',
        'weth',
      ].sort();
      expect(Object.keys(ROBINHOOD_TESTNET_CONFIG.contracts).sort()).toEqual(expectedContractKeys);

      const expectedQuoteAddressKeys = [
        'hooks',
        'nativeEth',
        'poolId',
        'poolManager',
        'stateView',
        'universalRouter',
        'usdg',
        'v4Quoter',
        'weth',
      ].sort();

      // Derive all keys in UNISWAP_V4_TESTNET_QUOTE whose values match an address or 32-byte hex hash
      const actualQuoteAddressKeys = Object.entries(UNISWAP_V4_TESTNET_QUOTE)
        .filter(
          ([, value]) =>
            typeof value === 'string' && /^0x[0-9a-fA-F]{40}$|^0x[0-9a-fA-F]{64}$/.test(value)
        )
        .map(([key]) => key)
        .sort();

      expect(actualQuoteAddressKeys).toEqual(expectedQuoteAddressKeys);
    });
  });

  describe('2. Address format verification', () => {
    it('verifies all 20-byte addresses conform to EVM format ^0x[0-9a-fA-F]{40}$', () => {
      const addressList = [
        PINNED_ADDRESSES.usdg,
        PINNED_ADDRESSES.poolManager,
        PINNED_ADDRESSES.stateView,
        PINNED_ADDRESSES.v4Quoter,
        PINNED_ADDRESSES.universalRouter,
        PINNED_ADDRESSES.wethAllowlisted,
        PINNED_ADDRESSES.nativeEth,
        PINNED_ADDRESSES.hooksZero,
        PINNED_ADDRESSES.placeholderMulticall,
        PINNED_ADDRESSES.placeholderRouter,
        PINNED_ADDRESSES.placeholderWeth,
      ];

      for (const addr of addressList) {
        expect(addr).toMatch(EVM_ADDRESS_REGEX);
        expect(addr.length).toBe(42);
      }
    });

    it('verifies poolId conforms to 32-byte hex format ^0x[0-9a-fA-F]{64}$', () => {
      expect(PINNED_ADDRESSES.poolId).toMatch(BYTES32_HEX_REGEX);
      expect(PINNED_ADDRESSES.poolId.length).toBe(66);
    });
  });

  describe('3. Placeholder isolation invariant', () => {
    it('ensures placeholder addresses are strictly distinct from all real testnet contracts', () => {
      const realAddresses = [
        PINNED_ADDRESSES.usdg.toLowerCase(),
        PINNED_ADDRESSES.poolManager.toLowerCase(),
        PINNED_ADDRESSES.stateView.toLowerCase(),
        PINNED_ADDRESSES.v4Quoter.toLowerCase(),
        PINNED_ADDRESSES.universalRouter.toLowerCase(),
        PINNED_ADDRESSES.wethAllowlisted.toLowerCase(),
      ];

      const placeholderAddresses = [
        PINNED_ADDRESSES.placeholderMulticall.toLowerCase(),
        PINNED_ADDRESSES.placeholderRouter.toLowerCase(),
        PINNED_ADDRESSES.placeholderWeth.toLowerCase(),
      ];

      for (const placeholder of placeholderAddresses) {
        expect(realAddresses).not.toContain(placeholder);
      }
    });

    it('ensures placeholder addresses are not referenced in UNISWAP_V4_TESTNET_QUOTE', () => {
      const quoteAddresses = [
        UNISWAP_V4_TESTNET_QUOTE.usdg.toLowerCase(),
        UNISWAP_V4_TESTNET_QUOTE.poolManager.toLowerCase(),
        UNISWAP_V4_TESTNET_QUOTE.stateView.toLowerCase(),
        UNISWAP_V4_TESTNET_QUOTE.v4Quoter.toLowerCase(),
        UNISWAP_V4_TESTNET_QUOTE.universalRouter.toLowerCase(),
        UNISWAP_V4_TESTNET_QUOTE.weth.toLowerCase(),
      ];

      expect(quoteAddresses).not.toContain(PINNED_ADDRESSES.placeholderMulticall.toLowerCase());
      expect(quoteAddresses).not.toContain(PINNED_ADDRESSES.placeholderRouter.toLowerCase());
      expect(quoteAddresses).not.toContain(PINNED_ADDRESSES.placeholderWeth.toLowerCase());
    });
  });

  describe('4. Inline literal address scan in source directories', () => {
    /**
     * Documented baseline of known legacy literal addresses outside packages/config.
     * PER ISSUE #34 / PR #35: These pre-existing occurrences are reported in PR #35 and NOT modified.
     * Stored as exact (file, address) pairs normalized to lower-case address.
     * Any NEW occurrence or pair outside this baseline will immediately fail this test.
     */
    const KNOWN_LEGACY_LITERAL_PAIRS = new Set([
      'apps/api/src/adapters/uniswap-v4-readonly-adapter.ts:0x0000000000000000000000000000000000000000',
      'apps/api/src/adapters/uniswap-v4-readonly-adapter.ts:0x7e955252e15c84f5768b83c41a71f9eba181802f',
      'apps/web/src/wallet/mock-wallet-adapter.ts:0x71c83d43c162818feefdf08b9b1eeb1d6b110b3b',
      'packages/core/src/quote/v4-abi.ts:0x0000000000000000000000000000000000000000',
      'packages/core/src/quote/v4-abi.ts:0x7e955252e15c84f5768b83c41a71f9eba181802f',
    ]);

    function scanSourceFiles(dir: string, baseDir: string): { file: string; matches: string[] }[] {
      const results: { file: string; matches: string[] }[] = [];
      if (!fs.existsSync(dir)) return results;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanSourceFiles(fullPath, baseDir));
        } else if (
          /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
          !entry.name.includes('.test.') &&
          !entry.name.includes('.spec.')
        ) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const matches = content.match(/0x[a-fA-F0-9]{40}\b/g);
          if (matches && matches.length > 0) {
            const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
            results.push({ file: relPath, matches: [...new Set(matches)] });
          }
        }
      }
      return results;
    }

    it('scans apps/*/src and packages/core/src and confirms no unauthorized inline literal addresses exist', () => {
      // Find repo root from current directory
      let repoRoot = process.cwd();
      if (!fs.existsSync(path.join(repoRoot, 'package.json'))) {
        repoRoot = path.resolve(__dirname, '../../..');
      }

      const scanDirs: string[] = [];
      const appsDir = path.join(repoRoot, 'apps');
      if (fs.existsSync(appsDir)) {
        const appEntries = fs.readdirSync(appsDir, { withFileTypes: true });
        for (const entry of appEntries) {
          if (entry.isDirectory()) {
            const srcPath = path.join(appsDir, entry.name, 'src');
            if (fs.existsSync(srcPath)) {
              scanDirs.push(srcPath);
            }
          }
        }
      }
      const coreSrc = path.join(repoRoot, 'packages/core/src');
      if (fs.existsSync(coreSrc)) {
        scanDirs.push(coreSrc);
      }

      const foundViolations: { file: string; address: string }[] = [];
      for (const d of scanDirs) {
        const hits = scanSourceFiles(d, repoRoot);
        for (const hit of hits) {
          for (const match of hit.matches) {
            const pairKey = `${hit.file}:${match.toLowerCase()}`;
            if (!KNOWN_LEGACY_LITERAL_PAIRS.has(pairKey)) {
              foundViolations.push({ file: hit.file, address: match });
            }
          }
        }
      }

      // Assert that NO unknown/new source files or pairs contain inline literal addresses
      expect(
        foundViolations,
        `Found unauthorized inline literal addresses outside packages/config: ${foundViolations.map((v) => `${v.file} (${v.address})`).join(', ')}`
      ).toHaveLength(0);
    });
  });
});
