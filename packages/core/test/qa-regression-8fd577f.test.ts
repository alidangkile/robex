// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, toHex } from 'viem';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import type { SwapTransactionState } from '@robex/types';
import {
  executeGuardedSwap,
  verifyAndParseReceipt,
  canTransitionTransaction,
  getPendingSwapStatus,
  checkAndResolvePendingSwap,
  clearDroppedPendingSwapAfterConfirmation,
  TRANSFER_EVENT_ABI,
  TRANSFER_EVENT_TOPIC,
} from '../src/index.js';
import { setInternalClockForTesting } from '../src/execution/build-swap-calldata.js';
import { InjectedWalletAdapter } from '../../../apps/web/src/wallet/injected-wallet-adapter.js';

describe('QA Regression Suite: Findings QA-01 to QA-11 (8fd577f)', () => {
  const TEST_USER = '0x8e94699c825a15275e720549aCE1D37612dD0d71';
  const ROUTER_ADDRESS = UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const USDG_ADDRESS = UNISWAP_V4_TESTNET_QUOTE.usdg;
  const CHAIN_ID = UNISWAP_V4_TESTNET_QUOTE.chainId;
  const FROZEN_TIME = 1710000000n;
  const VALID_HASH_1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const VALID_HASH_2 = '0x0000000000000000000000000000000000000000000000000000000000000002';

  beforeEach(() => {
    setInternalClockForTesting(() => FROZEN_TIME);
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.clear();
      }
    } catch {
      // Ignore
    }
  });

  afterEach(() => {
    setInternalClockForTesting(null);
  });

  function createStandardSwapParams(overrides?: Record<string, unknown>) {
    return {
      chainId: CHAIN_ID,
      amountIn: 500_000_000_000n,
      amountOut: 1128n,
      ...overrides,
    };
  }

  function createMockRpc(overrides: Record<string, unknown> = {}) {
    return async (method: string, params: unknown[] = []): Promise<unknown> => {
      if (overrides[method] !== undefined) {
        const handler = overrides[method];
        return typeof handler === 'function' ? handler(params) : handler;
      }

      if (method === 'eth_chainId') return '0xb626';
      if (method === 'eth_accounts') return [TEST_USER];
      if (method === 'eth_getBlockByNumber') return { timestamp: toHex(FROZEN_TIME) };
      if (method === 'eth_getBalance') return toHex(10n ** 18n);
      if (method === 'eth_call') return '0x';
      if (method === 'eth_estimateGas') return '0x203a0';
      if (method === 'eth_gasPrice') return toHex(10_000_000n);
      if (method === 'eth_getTransactionByHash') return { nonce: '0x5' };
      if (method === 'eth_getTransactionReceipt') {
        return {
          status: '0x1',
          to: ROUTER_ADDRESS,
          from: TEST_USER,
          blockNumber: '0x1',
          transactionHash: VALID_HASH_1,
          logs: [],
        };
      }
      throw new Error(`Unexpected RPC method call: ${method}`);
    };
  }

  // QA-01: Synchronous in-flight lock prevents double-submission on concurrent clicks
  it('QA-01: synchronous in-flight lock prevents double-submission on concurrent clicks', async () => {
    let sendCount = 0;
    const priorPendingHash = '0x0000000000000000000000000000000000000000000000000000000000000099';

    // Populate a resolved pending swap to trigger receipt check in 8fd577f (Probe D)
    const injectedMod = await import('../../../apps/web/src/wallet/injected-wallet-adapter.js');
    if (typeof (injectedMod as any).setSessionPendingSwap === 'function') {
      (injectedMod as any).setSessionPendingSwap(TEST_USER, CHAIN_ID, priorPendingHash);
    }

    const mockProvider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_USER];
        if (method === 'eth_getBlockByNumber') return { timestamp: toHex(FROZEN_TIME) };
        if (method === 'eth_getBalance') return toHex(10n ** 18n);
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0';
        if (method === 'eth_gasPrice') return toHex(10_000_000n);
        if (method === 'eth_getTransactionByHash') return { nonce: '0x5' };
        if (method === 'eth_sendTransaction') {
          sendCount++;
          return VALID_HASH_1;
        }
        if (method === 'eth_getTransactionReceipt') {
          const queried = params?.[0];
          return {
            status: '0x1',
            to: ROUTER_ADDRESS,
            from: TEST_USER,
            blockNumber: '0x1',
            transactionHash: queried ?? VALID_HASH_1,
            logs: [],
          };
        }
        throw new Error(`Unexpected method ${method}`);
      },
      on: () => {},
      removeListener: () => {},
    };

    const adapter = new InjectedWalletAdapter(mockProvider as any);
    await adapter.connect();

    // Trigger concurrent send calls
    const p1 = adapter.sendSwapTransaction(createStandardSwapParams());
    const p2 = adapter.sendSwapTransaction(createStandardSwapParams());

    // In 8fd577f, because receipt was awaited before setting isSwapInFlight, p2 did not reject
    // and both transactions were sent out (sendCount=2). In the fix, lock is taken synchronously.
    await expect(p2).rejects.toThrow('already in flight');
    const res1 = await p1;

    expect(res1.state).toBe('confirmed');
    expect(sendCount).toBe(1);
  });

  // QA-02: Pending-hash guard recorded immediately at submitted and persisted in localStorage
  it('QA-02: pending swap is recorded at submitted and persisted in localStorage', async () => {
    const rpcCall = createMockRpc();
    const sendTransaction = async () => VALID_HASH_1;

    let submittedEntryCaptured: unknown = null;
    const onStateChange = (state: SwapTransactionState) => {
      if (state === 'submitted') {
        submittedEntryCaptured = getPendingSwapStatus(TEST_USER, CHAIN_ID);
      }
    };

    await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange,
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    // In 8fd577f, pending swap was NOT recorded at submitted (only recorded after timeout in adapter).
    expect(submittedEntryCaptured).not.toBeNull();
    expect((submittedEntryCaptured as { txHash: string }).txHash).toBe(VALID_HASH_1);
    expect((submittedEntryCaptured as { chainId: number }).chainId).toBe(CHAIN_ID);
    expect((submittedEntryCaptured as { from: string }).from).toBe(TEST_USER.toLowerCase());
  });

  // QA-03: Nonce check clears pending swap when replaced or cancelled on-chain
  it('QA-03: clears pending swap when on-chain nonce exceeds recorded nonce', async () => {
    // Write a pending entry with nonce 5 into storage
    const storageKey = `robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`;
    const pendingEntry = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 5,
      recordedAt: Date.now(),
    };
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(storageKey, JSON.stringify(pendingEntry));
    }

    // On-chain latest nonce is now 6 (transaction was replaced/cancelled)
    const mockRpc = async (method: string) => {
      if (method === 'eth_getTransactionReceipt') return null; // No receipt for original hash
      if (method === 'eth_getTransactionCount') return '0x6'; // Nonce 6 > 5
      throw new Error(`Unexpected method ${method}`);
    };

    // 8fd577f lacked checkAndResolvePendingSwap and had no nonce check, locking user indefinitely.
    const resolved = await checkAndResolvePendingSwap(TEST_USER, CHAIN_ID, mockRpc);
    expect(resolved).toBeNull();
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).toBeNull();

    // Also tests clearDroppedPendingSwapAfterConfirmation with explicit confirmation after 10 mins
    const expiredEntry = {
      txHash: VALID_HASH_2,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 10,
      recordedAt: Date.now() - 11 * 60 * 1000,
    };
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(`robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`, JSON.stringify(expiredEntry));
    }
    const mempoolRpc = async (method: string) => {
      if (method === 'eth_getTransactionByHash') return null; // dropped from mempool
      if (method === 'eth_getTransactionReceipt') return null;
      throw new Error(`Unexpected method ${method}`);
    };
    const cleared = await clearDroppedPendingSwapAfterConfirmation({
      from: TEST_USER,
      chainId: CHAIN_ID,
      rpcCall: mempoolRpc,
      userConfirmed: true,
    });
    expect(cleared).toBe(true);
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).toBeNull();
  });

  // QA-04: Strict tx hash regex /^0x[0-9a-fA-F]{64}$/ rejects malformed or short hashes
  it('QA-04: rejects non-64-hex transaction hashes with provider_error', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc();
    // Short hash that starts with 0x but is NOT 64 hex characters
    const sendTransaction = async () => '0x1234';

    await expect(
      executeGuardedSwap(createStandardSwapParams(), {
        userAddress: TEST_USER,
        rpcCall,
        sendTransaction,
        onStateChange: (s) => states.push(s),
      })
    ).rejects.toThrow('Wallet returned invalid transaction hash');

    // 8fd577f only checked startsWith('0x'), so '0x1234' proceeded to submitted and pending!
    expect(states).toContain('provider_error');
    expect(states).not.toContain('submitted');
  });

  // QA-05: Post-submission error handling catches malformed receipts without losing hash or guard
  it('QA-05: wraps post-submission in try/catch to preserve txHash and maintain guard on malformed receipt', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x1',
        to: ROUTER_ADDRESS,
        from: TEST_USER,
        blockNumber: null, // Causes TypeError: Cannot convert null to a BigInt in 8fd577f
        transactionHash: VALID_HASH_1,
        logs: [],
      },
    });
    const sendTransaction = async () => VALID_HASH_1;

    // 8fd577f threw an unhandled TypeError, lost the return result and lost the hash
    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    expect(result.txHash).toBe(VALID_HASH_1);
    expect(result.state).toBe('anomaly');
    expect(result.anomalyReason).toContain('blockNumber');
  });

  // QA-06: Receipt verification checks hash before status and treats non-0x0/0x1 status as anomaly
  it('QA-06: checks transactionHash before status and classifies non-0x0/0x1 as anomaly', () => {
    // (a) Receipt status 0x0 but mismatched hash -> must be anomaly, NOT reverted
    const mismatchedReceipt = {
      status: '0x0',
      to: ROUTER_ADDRESS,
      from: TEST_USER,
      blockNumber: '0x1',
      transactionHash: VALID_HASH_2, // Mismatched!
      logs: [],
    };

    const resA = verifyAndParseReceipt(mismatchedReceipt, {
      expectedTxHash: VALID_HASH_1,
      expectedRouter: ROUTER_ADDRESS,
      userAddress: TEST_USER,
      amountOutMinimum: 1000n,
    });
    // In 8fd577f, status 0x0 was checked first, so this returned 'reverted' without verifying hash!
    expect(resA.status).toBe('anomaly');
    expect(resA.anomalyReason).toContain('does not match expected txHash');

    // (b) Unknown status '0x2' -> must be anomaly without rewriting status to 0x0
    const unknownStatusReceipt = {
      status: '0x2',
      to: ROUTER_ADDRESS,
      from: TEST_USER,
      blockNumber: '0x1',
      transactionHash: VALID_HASH_1,
      logs: [],
    };
    const resB = verifyAndParseReceipt(unknownStatusReceipt, {
      expectedTxHash: VALID_HASH_1,
      expectedRouter: ROUTER_ADDRESS,
      userAddress: TEST_USER,
      amountOutMinimum: 1000n,
    });
    // In 8fd577f, anything not 0x1 was forced to 'reverted' with status overwritten to 0x0!
    expect(resB.status).toBe('anomaly');
    expect(resB.receipt.status).toBe('0x2');
  });

  // QA-07: hasDecodeFailure flag is carried into execution result
  it('QA-07: carries hasDecodeFailure flag into SendSwapTransactionResult', async () => {
    const transferTopics = encodeEventTopics({
      abi: TRANSFER_EVENT_ABI,
      eventName: 'Transfer',
      args: {
        from: '0x0000000000000000000000000000000000000000',
        to: TEST_USER as `0x${string}`,
      },
    });

    const malformedLog = {
      address: USDG_ADDRESS,
      topics: [
        TRANSFER_EVENT_TOPIC,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000008e94699c825a15275e720549ace1d37612dd0d71',
      ],
      data: '0x1234', // Malformed data
    };

    const goodLog = {
      address: USDG_ADDRESS,
      topics: transferTopics,
      data: encodeAbiParameters([{ type: 'uint256' }], [1128n]),
    };

    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x1',
        to: ROUTER_ADDRESS,
        from: TEST_USER,
        blockNumber: '0x1',
        transactionHash: VALID_HASH_1,
        logs: [goodLog, malformedLog],
      },
    });
    const sendTransaction = async () => VALID_HASH_1;

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    // In 8fd577f, hasDecodeFailure was omitted from SendSwapTransactionResult
    expect(result.hasDecodeFailure).toBe(true);
  });

  // QA-08: Every error path emits a terminal state; session invalidation emits cancelled; account mismatch emits user_error
  it('QA-08: emits cancelled on session invalidation and user_error on account mismatch', async () => {
    // (a) Session invalidation emits cancelled (not rejected)
    const statesA: SwapTransactionState[] = [];
    const rpcCallA = createMockRpc();
    const sendTxA = vi.fn();
    let sessionActive = false;

    await expect(
      executeGuardedSwap(createStandardSwapParams(), {
        userAddress: TEST_USER,
        rpcCall: rpcCallA,
        sendTransaction: sendTxA,
        isSessionActive: () => sessionActive,
        onStateChange: (s) => statesA.push(s),
      })
    ).rejects.toThrow('Swap transaction cancelled');

    // In 8fd577f, session invalidation emitted 'rejected' instead of distinct 'cancelled'
    expect(statesA).toContain('cancelled');
    expect(statesA).not.toContain('rejected');

    // (b) Step (b) account mismatch emits user_error (not provider_error)
    const statesB: SwapTransactionState[] = [];
    const rpcCallB = createMockRpc({
      eth_accounts: ['0x1111111111111111111111111111111111111111'],
    });

    await expect(
      executeGuardedSwap(createStandardSwapParams(), {
        userAddress: TEST_USER,
        rpcCall: rpcCallB,
        sendTransaction: vi.fn(),
        onStateChange: (s) => statesB.push(s),
      })
    ).rejects.toThrow('does not match expected sender');

    // In 8fd577f, account mismatch emitted 'provider_error'
    expect(statesB).toContain('user_error');
    expect(statesB).not.toContain('provider_error');
  });

  // QA-09: sendSwapTransaction accepts onStateChange callback and passes it through
  it('QA-09: sendSwapTransaction accepts onStateChange callback and forwards states + txHash', async () => {
    const states: SwapTransactionState[] = [];
    const capturedDetails: unknown[] = [];

    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_USER];
        if (method === 'eth_getBlockByNumber') return { timestamp: toHex(FROZEN_TIME) };
        if (method === 'eth_getBalance') return toHex(10n ** 18n);
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0';
        if (method === 'eth_gasPrice') return toHex(10_000_000n);
        if (method === 'eth_getTransactionByHash') return { nonce: '0x5' };
        if (method === 'eth_sendTransaction') return VALID_HASH_1;
        if (method === 'eth_getTransactionReceipt') {
          return {
            status: '0x1',
            to: ROUTER_ADDRESS,
            from: TEST_USER,
            blockNumber: '0x1',
            transactionHash: VALID_HASH_1,
            logs: [],
          };
        }
        throw new Error(`Unexpected method ${method}`);
      },
      on: () => {},
      removeListener: () => {},
    };

    const adapter = new InjectedWalletAdapter(mockProvider as any, null, {
      timeoutMs: 1000,
      pollIntervalMs: 10,
    });
    await adapter.connect();

    const onStateChange = (state: SwapTransactionState, details?: unknown) => {
      states.push(state);
      if (details) capturedDetails.push(details);
    };

    // In 8fd577f, sendSwapTransaction ignored or did not accept onStateChange callback
    const result = await adapter.sendSwapTransaction(createStandardSwapParams(), onStateChange);

    expect(result.state).toBe('confirmed');
    expect(states).toContain('wallet_confirmation');
    expect(states).toContain('submitted');
    expect(states).toContain('pending');
    expect(states).toContain('confirmed');
    expect(capturedDetails.some((d) => (d as { txHash?: string }).txHash === VALID_HASH_1)).toBe(true);
  });

  // QA-10: Production bundle excludes mock send code and fake mock hash
  it('QA-10: strictly excludes mock send code and fake hash from production dist bundle', () => {
    const distDir = path.resolve(__dirname, '../../../apps/web/dist/assets');
    if (!fs.existsSync(distDir)) {
      return;
    }
    const jsFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distDir, file), 'utf8');
      // In 8fd577f, index-BnytqcLN.js contained the fake mock hash and DISABLED_IN_PRODUCTION
      expect(content).not.toContain('0x000000000000000000000000000000000000000000000000000000000000f4ce');
      expect(content).not.toContain('DISABLED_IN_PRODUCTION');
    }
  });

  // QA-11: State machine allows timeout -> confirmed/reverted/anomaly on late receipts; no guard re-exports
  it('QA-11: state machine allows timeout -> confirmed/reverted/anomaly and wallet-context has no guard re-exports', async () => {
    // (a) State machine transitions from timeout to confirmed, reverted, anomaly
    expect(canTransitionTransaction('timeout', 'confirmed')).toBe(true);
    expect(canTransitionTransaction('timeout', 'reverted')).toBe(true);
    expect(canTransitionTransaction('timeout', 'anomaly')).toBe(true);

    // In 8fd577f, canTransitionTransaction('timeout', 'confirmed') was false!
    expect(canTransitionTransaction('ready', 'confirmed')).toBe(false);

    // (b) wallet-context does NOT re-export setSessionPendingSwap or clearSessionPendingSwap
    const walletContextModule = await import('../../../apps/web/src/wallet/wallet-context.js');
    expect((walletContextModule as Record<string, unknown>).setSessionPendingSwap).toBeUndefined();
    expect((walletContextModule as Record<string, unknown>).clearSessionPendingSwap).toBeUndefined();
  });

  // QA-12 / M1: Nonce advancement check calls eth_getTransactionCount and clears only when currentNonce > pending.nonce
  it('QA-12 / M1: checkAndResolvePendingSwap calls eth_getTransactionCount and clears entry only when currentNonce > pending.nonce', async () => {
    const storageKey = `robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`;
    const entry = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 7,
      recordedAt: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(entry));

    const countSpy = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') return null;
      if (method === 'eth_getTransactionCount') return '0x8'; // 8 > 7
      throw new Error(`Unexpected method ${method}`);
    });

    const res = await checkAndResolvePendingSwap(TEST_USER, CHAIN_ID, countSpy);
    expect(countSpy).toHaveBeenCalledWith('eth_getTransactionCount', [TEST_USER.toLowerCase(), 'latest']);
    expect(res).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).toBeNull();

    // Nonce not passed: 7 == 7
    localStorage.setItem(storageKey, JSON.stringify(entry));
    const sameNonceSpy = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') return null;
      if (method === 'eth_getTransactionCount') return '0x7'; // 7 == 7
      throw new Error(`Unexpected method ${method}`);
    });
    const resSame = await checkAndResolvePendingSwap(TEST_USER, CHAIN_ID, sameNonceSpy);
    expect(resSame).not.toBeNull();
    expect(resSame?.nonce).toBe(7);
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).not.toBeNull();
  });

  // QA-12 / M2: 10-minute check boundary (9m59s blocked, 10m01s cleared)
  it('QA-12 / M2: clearDroppedPendingSwapAfterConfirmation enforces 10-minute boundary (9m59s blocked, 10m01s cleared)', async () => {
    const storageKey = `robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`;
    const now = Date.now();

    // 9m59s (599,000ms ago) -> MUST THROW SECURITY_ERROR and KEEP entry
    const entry9m59s = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 5,
      recordedAt: now - 599_000,
    };
    localStorage.setItem(storageKey, JSON.stringify(entry9m59s));

    const rpcMock = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionByHash') return null;
      if (method === 'eth_getTransactionReceipt') return null;
      throw new Error(`Unexpected method ${method}`);
    });

    await expect(
      clearDroppedPendingSwapAfterConfirmation({
        from: TEST_USER,
        chainId: CHAIN_ID,
        rpcCall: rpcMock,
        userConfirmed: true,
      })
    ).rejects.toThrow(/Cannot clear pending swap before 10 minutes have elapsed/);

    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).not.toBeNull();

    // 10m01s (601,000ms ago) -> Clears when dropped from mempool
    const entry10m01s = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 5,
      recordedAt: now - 601_000,
    };
    localStorage.setItem(storageKey, JSON.stringify(entry10m01s));

    const cleared = await clearDroppedPendingSwapAfterConfirmation({
      from: TEST_USER,
      chainId: CHAIN_ID,
      rpcCall: rpcMock,
      userConfirmed: true,
    });
    expect(rpcMock).toHaveBeenCalledWith('eth_getTransactionByHash', [VALID_HASH_1]);
    expect(cleared).toBe(true);
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  // QA-12 / M3: Mempool recognition prevents clearing (txObj !== null)
  it('QA-12 / M3: clearDroppedPendingSwapAfterConfirmation blocks when transaction is still recognized in mempool (txObj !== null)', async () => {
    const storageKey = `robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`;
    const now = Date.now();
    const entry11m = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 5,
      recordedAt: now - 660_000,
    };
    localStorage.setItem(storageKey, JSON.stringify(entry11m));

    const rpcMempool = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionByHash') return { hash: VALID_HASH_1, nonce: '0x5' };
      if (method === 'eth_getTransactionReceipt') return null;
      throw new Error(`Unexpected method ${method}`);
    });

    await expect(
      clearDroppedPendingSwapAfterConfirmation({
        from: TEST_USER,
        chainId: CHAIN_ID,
        rpcCall: rpcMempool,
        userConfirmed: true,
      })
    ).rejects.toThrow(/Transaction .* is still recognized by node. Cannot clear while in mempool./);

    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).not.toBeNull();
  });

  // QA-12 / M4: Storage persistence across module reset
  it('QA-12 / M4: pending entry persists in localStorage across module reset and is read back', async () => {
    const { recordPendingSwapInternal } = await import('../src/execution/pending-guard.js');
    const entry = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 7,
      recordedAt: 123456789,
    };
    recordPendingSwapInternal(entry);

    const storageKey = `robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`;
    const storedRaw = localStorage.getItem(storageKey);
    expect(storedRaw).not.toBeNull();
    expect(JSON.parse(storedRaw!).txHash).toBe(VALID_HASH_1);

    vi.resetModules();

    const { getPendingSwapStatus: getStatus2 } = await import('../src/execution/pending-guard.js');
    const restored = getStatus2(TEST_USER, CHAIN_ID);
    expect(restored).not.toBeNull();
    expect(restored?.txHash).toBe(VALID_HASH_1);
    expect(restored?.nonce).toBe(7);
  });

  // QA-14: Receipt transactionHash mismatch does not clear pending guard
  it('QA-14: does not clear pending guard when receipt transactionHash does not match pending txHash', async () => {
    const storageKey = `robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`;
    const entry = {
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 7,
      recordedAt: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(entry));

    const mismatchedReceiptRpc = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') {
        return {
          status: '0x1',
          to: ROUTER_ADDRESS,
          from: TEST_USER,
          blockNumber: '0x10',
          transactionHash: VALID_HASH_2,
          logs: [],
        };
      }
      throw new Error(`Unexpected method ${method}`);
    });

    const res = await checkAndResolvePendingSwap(TEST_USER, CHAIN_ID, mismatchedReceiptRpc);
    expect(res).not.toBeNull();
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).not.toBeNull();

    const execRpc = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x1',
        to: ROUTER_ADDRESS,
        from: TEST_USER,
        blockNumber: '0x10',
        transactionHash: VALID_HASH_2,
        logs: [],
      },
    });

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall: execRpc,
      sendTransaction: async () => VALID_HASH_1,
    });

    expect(result.state).toBe('anomaly');
    expect(result.anomalyReason).toContain('does not match expected txHash');
    expect(getPendingSwapStatus(TEST_USER, CHAIN_ID)).not.toBeNull();
  });

  // QA-15: Malformed receipt (blockNumber null/invalid or logs not an array) transitions to anomaly, never confirmed
  it('QA-15: malformed receipt (blockNumber null/invalid or logs not an array) transitions to anomaly, never confirmed', () => {
    const nullBlockReceipt = {
      status: '0x1',
      to: ROUTER_ADDRESS,
      from: TEST_USER,
      blockNumber: null,
      transactionHash: VALID_HASH_1,
      logs: [],
    };
    const verifiedA = verifyAndParseReceipt(nullBlockReceipt as any, {
      expectedRouter: ROUTER_ADDRESS,
      userAddress: TEST_USER,
      amountOutMinimum: 100n,
      expectedTxHash: VALID_HASH_1,
    });
    expect(verifiedA.confirmed).toBe(false);
    expect(verifiedA.status).toBe('anomaly');
    expect(verifiedA.anomalyReason).toContain('blockNumber');

    const badLogsReceipt = {
      status: '0x1',
      to: ROUTER_ADDRESS,
      from: TEST_USER,
      blockNumber: '0x10',
      transactionHash: VALID_HASH_1,
      logs: { not: 'an array' },
    };
    const verifiedB = verifyAndParseReceipt(badLogsReceipt as any, {
      expectedRouter: ROUTER_ADDRESS,
      userAddress: TEST_USER,
      amountOutMinimum: 100n,
      expectedTxHash: VALID_HASH_1,
    });
    expect(verifiedB.confirmed).toBe(false);
    expect(verifiedB.status).toBe('anomaly');
    expect(verifiedB.anomalyReason).toContain('logs');
  });

  // QA-16: Rejecting onStateChange in params with USER_ERROR
  it('QA-16: rejecting onStateChange in params with USER_ERROR', async () => {
    const rpc = createMockRpc();
    await expect(
      executeGuardedSwap({ ...createStandardSwapParams(), onStateChange: () => {} } as any, {
        userAddress: TEST_USER,
        rpcCall: rpc,
        sendTransaction: async () => VALID_HASH_1,
      })
    ).rejects.toThrow('Unknown parameter key "onStateChange" passed to sendSwapTransaction');
  });

  // QA-13: Web Locks API blocks concurrent swap in another tab
  it('QA-13: Web Locks API blocks concurrent swap in another tab', async () => {
    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_USER];
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
    const adapter = new InjectedWalletAdapter(mockProvider as any);
    await adapter.connect();

    const originalLocks = (globalThis as any).navigator?.locks;
    try {
      (globalThis as any).navigator = {
        ...(globalThis as any).navigator,
        locks: {
          request: vi.fn().mockImplementation(async (_name: string, _options: any, callback: (lock: any) => Promise<any>) => {
            return callback(null);
          }),
        },
      };

      await expect(
        adapter.sendSwapTransaction(createStandardSwapParams())
      ).rejects.toThrow('A swap transaction is already in flight in another tab or window');
    } finally {
      if (originalLocks !== undefined) {
        (globalThis as any).navigator.locks = originalLocks;
      } else if ((globalThis as any).navigator) {
        delete (globalThis as any).navigator.locks;
      }
    }
  });

  // QA-18: UI callback error isolation, contextual pending message, fail-closed storage, and nullable status preservation
  it('QA-18: UI callback error isolation, contextual pending message, fail-closed storage, and nullable status preservation', async () => {
    // A: UI callback throws error during executeGuardedSwap
    const rpc = createMockRpc();
    const throwingCallback = (state: SwapTransactionState) => {
      if (state === 'submitted') {
        throw new Error('UI crashed on submitted');
      }
    };

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall: rpc,
      sendTransaction: async () => VALID_HASH_1,
      onStateChange: throwingCallback,
    });
    expect(result.state).toBe('confirmed');
    expect(result.txHash).toBe(VALID_HASH_1);

    // B: Contextual pending message
    const mockProviderB = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_USER];
        if (method === 'eth_getTransactionReceipt') return null;
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
    const adapter = new InjectedWalletAdapter(mockProviderB as any);
    await adapter.connect();

    // Under 180s:
    localStorage.setItem(`robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`, JSON.stringify({
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 1,
      recordedAt: Date.now() - 30_000,
    }));

    await expect(adapter.sendSwapTransaction(createStandardSwapParams())).rejects.toThrow(
      /is currently being confirmed on-chain/
    );

    // Over 180s:
    localStorage.setItem(`robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`, JSON.stringify({
      txHash: VALID_HASH_1,
      from: TEST_USER.toLowerCase(),
      chainId: CHAIN_ID,
      nonce: 1,
      recordedAt: Date.now() - 200_000,
    }));

    await expect(adapter.sendSwapTransaction(createStandardSwapParams())).rejects.toThrow(
      /timed out and is still pending on-chain/
    );

    // C: Malformed entry in storage fails closed
    localStorage.setItem(`robex_pending_swap:${TEST_USER.toLowerCase()}:${CHAIN_ID}`, 'INVALID_JSON{{{');
    const malformedStatus = getPendingSwapStatus(TEST_USER, CHAIN_ID);
    expect(malformedStatus).not.toBeNull();

    // D: Status null preserved in receipt
    const nullStatusReceipt = {
      status: null,
      to: ROUTER_ADDRESS,
      from: TEST_USER,
      blockNumber: '0x1',
      transactionHash: VALID_HASH_1,
      logs: [],
    };
    const execNullRpc = createMockRpc({ eth_getTransactionReceipt: nullStatusReceipt });
    const nullRes = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall: execNullRpc,
      sendTransaction: async () => VALID_HASH_1,
    });
    expect(nullRes.state).toBe('anomaly');
    expect(nullRes.receipt?.status).toBeNull();
  });
});
