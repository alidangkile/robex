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
   * Proven in Plan 003A §2, Plan 003B §2, Plan R1 §3 (ERC1967Proxy verified on Blockscout at block 132905228).
   */
  usdg: '0x7E955252E15c84f5768B83c41a71F9eba181802F',

  /**
   * Uniswap v4 PoolManager singleton contract on 46630.
   * Proven in Plan 003A §3, Plan 003B §2, Plan 004 §2.1 (verified bytecode at block 130884439).
   */
  poolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',

  /**
   * Uniswap v4 StateView lens contract on 46630.
   * Proven in Plan 003A §3, Plan 003B §2 (verified bytecode at block 130884439).
   */
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',

  /**
   * Uniswap v4 V4Quoter readonly lens contract on 46630.
   * Proven in Plan 003A §3, Plan 003B §2 (verified bytecode at block 130884439).
   */
  v4Quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',

  /**
   * Official allowlisted testnet WETH token on 46630.
   * Proven in Plan 003A §2 (allowlisted official testnet WETH, not the V1 quotable pair).
   */
  wethAllowlisted: '0x7943e237c7F95DA44E0301572D358911207852Fa',

  /**
   * Uniswap v4 Native ETH currency representation address(0).
   * Proven in Plan 003A §2, Plan 004 §2 (Uniswap v4 Currency.wrap(address(0))).
   */
  nativeEth: '0x0000000000000000000000000000000000000000',

  /**
   * Uniswap v4 Pool hooks sentinel address(0) for unhooked ETH/USDG 3000 pool.
   * Proven in Plan 003A §3, Plan 004 §4 (zero address indicates no custom hook contract).
   */
  hooksZero: '0x0000000000000000000000000000000000000000',

  /**
   * Pinned pool ID (bytes32 keccak256 hash) for ETH/USDG fee 3000 tickSpacing 60 pool.
   * Proven in Plan 003A §4, Plan 003B §2, Plan 004 §4 (poolId derived from PoolKey).
   */
  poolId: '0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669',

  /**
   * PLACEHOLDER: Multicall contract address from Plan 001 Foundation (robinhood-testnet.ts:27).
   * Invariant: Must NEVER match any real production contract.
   */
  placeholderMulticall: '0x1234567890123456789012345678901234567890',

  /**
   * PLACEHOLDER: Router placeholder address from Plan 001 Foundation (robinhood-testnet.ts:28).
   * Invariant: Must NEVER match any real production contract.
   */
  placeholderRouter: '0x0000000000000000000000000000000000000001',

  /**
   * PLACEHOLDER: WETH placeholder address in contracts map from Plan 001 Foundation (robinhood-testnet.ts:29).
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
      expect(contracts.multicall?.toLowerCase()).toBe(PINNED_ADDRESSES.placeholderMulticall.toLowerCase());
      expect(contracts.routerPlaceholder?.toLowerCase()).toBe(PINNED_ADDRESSES.placeholderRouter.toLowerCase());
      expect(contracts.weth?.toLowerCase()).toBe(PINNED_ADDRESSES.placeholderWeth.toLowerCase());
    });
  });

  describe('2. Address format verification', () => {
    it('verifies all 20-byte addresses conform to EVM format ^0x[0-9a-fA-F]{40}$', () => {
      const addressList = [
        PINNED_ADDRESSES.usdg,
        PINNED_ADDRESSES.poolManager,
        PINNED_ADDRESSES.stateView,
        PINNED_ADDRESSES.v4Quoter,
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
     * PER ISSUE #34: These pre-existing occurrences are reported in PR #34 and NOT modified.
     * Any NEW occurrence outside this baseline will immediately fail this test.
     */
    const KNOWN_LEGACY_LITERAL_FILES = new Set([
      'apps/api/src/adapters/uniswap-v4-readonly-adapter.ts',
      'apps/web/src/wallet/mock-wallet-adapter.ts',
      'packages/core/src/quote/v4-abi.ts',
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

      const scanDirs = [
        path.join(repoRoot, 'apps/api/src'),
        path.join(repoRoot, 'apps/web/src'),
        path.join(repoRoot, 'packages/core/src'),
      ];

      const foundViolations: { file: string; matches: string[] }[] = [];
      for (const d of scanDirs) {
        const hits = scanSourceFiles(d, repoRoot);
        for (const hit of hits) {
          if (!KNOWN_LEGACY_LITERAL_FILES.has(hit.file)) {
            foundViolations.push(hit);
          }
        }
      }

      // Assert that NO unknown/new source files contain inline literal addresses
      expect(
        foundViolations,
        `Found unauthorized inline literal addresses outside packages/config in files: ${foundViolations.map((v) => v.file).join(', ')}`
      ).toHaveLength(0);
    });
  });
});
