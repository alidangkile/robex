import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, toHex } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import {
  RobexAppError,
  executeGuardedSwap,
  verifyAndParseReceipt,
  pollTransactionReceipt,
  sumUsdgTransferLogs,
  sumUsdgTransferLogsDetailed,
  TRANSFER_EVENT_TOPIC,
  TRANSFER_EVENT_ABI,
} from '../src/index.js';
import { isUserRejectionError } from '../src/execution/guarded-send.js';
import { setInternalClockForTesting } from '../src/execution/build-swap-calldata.js';
import type { SwapTransactionState } from '@robex/types';

describe('Guarded Swap Execution Core & Receipt Tracking (C1 PR 2A)', () => {
  const TEST_USER = '0x8e94699c825a15275e720549aCE1D37612dD0d71';
  const ROUTER_ADDRESS = UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const USDG_ADDRESS = UNISWAP_V4_TESTNET_QUOTE.usdg;
  const CHAIN_ID = UNISWAP_V4_TESTNET_QUOTE.chainId; // 46630
  const FROZEN_TIME = 1710000000n;

  beforeEach(() => {
    setInternalClockForTesting(() => FROZEN_TIME);
  });

  afterEach(() => {
    setInternalClockForTesting(null);
  });

  function createStandardSwapParams(overrides?: Record<string, unknown>) {
    return {
      chainId: CHAIN_ID,
      amountIn: 500_000_000_000n, // 0.0000005 ETH
      amountOut: 1128n, // minOut = 1,122n at 50 bps
      ...overrides,
    };
  }

  function createMockRpc(overrides: Record<string, unknown> = {}) {
    return async (method: string, params: unknown[] = []): Promise<unknown> => {
      if (overrides[method] !== undefined) {
        const handler = overrides[method];
        return typeof handler === 'function' ? handler(params) : handler;
      }

      if (method === 'eth_chainId') return '0xb626'; // 46630
      if (method === 'eth_accounts') return [TEST_USER];
      if (method === 'eth_getBlockByNumber') return { timestamp: toHex(FROZEN_TIME) };
      if (method === 'eth_getBalance') return toHex(10n ** 18n); // 1 ETH
      if (method === 'eth_call') return '0x';
      if (method === 'eth_estimateGas') return '0x203a0'; // 132,000
      if (method === 'eth_gasPrice') return toHex(10_000_000n); // 10 Mwei
      if (method === 'eth_getTransactionReceipt') {
        const transferTopics = encodeEventTopics({
          abi: TRANSFER_EVENT_ABI,
          eventName: 'Transfer',
          args: {
            from: '0x0000000000000000000000000000000000000000',
            to: TEST_USER as `0x${string}`,
          },
        });
        return {
          status: '0x1',
          to: ROUTER_ADDRESS,
          from: TEST_USER,
          blockNumber: '0x7f546cb',
          transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          logs: [
            {
              address: USDG_ADDRESS,
              topics: transferTopics,
              data: encodeAbiParameters([{ type: 'uint256' }], [1128n]),
            },
          ],
        };
      }
      throw new Error(`Unexpected RPC method call: ${method}`);
    };
  }

  // 1. Full Progressive Lifecycle & Output Constraints
  it('executes full guarded swap sequence (a)-(f) with exact gas calculation and receipt verification', async () => {
    const states: SwapTransactionState[] = [];
    let sentPayload: { from: string; to: string; value: string; data: string; gas: string; chainId: string } | null = null;

    const rpcCall = createMockRpc();
    const sendTransaction = async (tx: typeof sentPayload) => {
      sentPayload = tx;
      return '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    };

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    // Verify state progression
    expect(states).toEqual([
      'ready',
      'wallet_confirmation',
      'submitted',
      'pending',
      'confirmed',
    ]);

    expect(result.state).toBe('confirmed');
    expect(result.txHash).toBe('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    expect(result.actualAmountReceived).toBe(1128n);
    expect(result.slippageExceeded).toBe(false);

    // Verify txPayload constraints (S-02)
    expect(sentPayload).not.toBeNull();
    expect(sentPayload?.from.toLowerCase()).toBe(TEST_USER.toLowerCase());
    expect(sentPayload?.to.toLowerCase()).toBe(ROUTER_ADDRESS.toLowerCase());
    expect(sentPayload?.value).toBe(toHex(500_000_000_000n));
    // gas = estimatedGas (132,000) * 120 / 100 = 158,400 (0x26ab0)
    expect(sentPayload?.gas).toBe(toHex(158_400n));
    expect(sentPayload?.chainId).toBe('0xb626');
    // Payload has exactly {from, to, value, data, gas, chainId}
    expect(Object.keys(sentPayload!).sort()).toEqual([
      'chainId',
      'data',
      'from',
      'gas',
      'to',
      'value',
    ]);
    // Verify no nonce, no message signing, no approve
    expect((sentPayload as Record<string, unknown>).nonce).toBeUndefined();
  });

  // 2. Strict Parameter Allowlist
  it('strictly rejects unknown parameter keys at runtime with USER_ERROR', async () => {
    const rpcCall = createMockRpc();
    const sendTransaction = async () => '0x1';

    const prohibitedKeys = [
      'nonce',
      'gasPrice',
      'userBalance',
      'currentTimestamp',
      'routerAddress',
      'amountOutMinimum',
      'from',
      'to',
      'value',
      'data',
    ];

    for (const badKey of prohibitedKeys) {
      await expect(
        executeGuardedSwap(
          createStandardSwapParams({ [badKey]: 'malicious' }),
          {
            userAddress: TEST_USER,
            rpcCall,
            sendTransaction,
          }
        )
      ).rejects.toThrow(RobexAppError);
    }
  });

  // 3. Pre-send step failures in exact order (a)-(f)
  describe('Pre-send step sequence in order (a)-(f)', () => {
    // (a) eth_chainId != 46630
    it('Step (a): fails with wrong_network when wallet chainId is not 46630', async () => {
      const states: SwapTransactionState[] = [];
      const rpcCall = createMockRpc({ eth_chainId: '0x1' }); // Mainnet 1
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow(RobexAppError);

      expect(states).toContain('wrong_network');
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    // (b) Active account mismatch & fails closed (S-01)
    it('Step (b): fails closed when active wallet account does not match expected sender', async () => {
      const states: SwapTransactionState[] = [];
      const rpcCall = createMockRpc({
        eth_accounts: ['0x1111111111111111111111111111111111111111'],
      });
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow('Active wallet account 0x1111111111111111111111111111111111111111 does not match expected sender');

      expect(states).toContain('provider_error');
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    it('Step (b): fails closed when eth_accounts returns an empty array (S-01)', async () => {
      const states: SwapTransactionState[] = [];
      const rpcCall = createMockRpc({
        eth_accounts: [], // Empty array
      });
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow('No active accounts returned from wallet');

      expect(states).toContain('provider_error');
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    it('Step (b): fails closed when eth_accounts returns an invalid address format (S-01)', async () => {
      const states: SwapTransactionState[] = [];
      const rpcCall = createMockRpc({
        eth_accounts: ['0xnot_an_address'],
      });
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow('not a valid EVM address');

      expect(states).toContain('provider_error');
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    // (c) Clock skew > +-30s
    it('Step (c): fails with expired and instructs device clock check when skew exceeds +-30s', async () => {
      const states: SwapTransactionState[] = [];
      // Block timestamp is 35s behind device time (skew = 35s > 30s)
      const rpcCall = createMockRpc({
        eth_getBlockByNumber: { timestamp: toHex(FROZEN_TIME - 35n) },
      });
      const sendTransaction = vi.fn();

      try {
        await executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        });
        expect.unreachable('Should have failed clock skew');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).message).toContain('kiểm tra đồng hồ thiết bị');
        expect(states).toContain('expired');
        expect(sendTransaction).not.toHaveBeenCalled();
      }
    });

    // (d) Core builder validation
    it('Step (d): fails when amountIn exceeds 0.0001 ETH cap (Decision D2)', async () => {
      const rpcCall = createMockRpc();
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(
          createStandardSwapParams({ amountIn: 1_000_000_000_000_000_000n }),
          {
            userAddress: TEST_USER,
            rpcCall,
            sendTransaction,
          }
        )
      ).rejects.toThrow(RobexAppError);

      expect(sendTransaction).not.toHaveBeenCalled();
    });

    // (e) Pre-send checks: Insufficient balance
    it('Step (e): fails with insufficient_balance when user balance is less than amountIn', async () => {
      const states: SwapTransactionState[] = [];
      const rpcCall = createMockRpc({
        eth_getBalance: '0x0', // 0 balance
      });
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow(RobexAppError);

      expect(states).toContain('insufficient_balance');
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    // (e) Pre-send checks: Simulation revert
    it('Step (e): fails closed on swap simulation revert without prompting wallet', async () => {
      const states: SwapTransactionState[] = [];
      const rpcCall = createMockRpc({
        eth_call: () => {
          throw new Error('Simulation reverted');
        },
      });
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams(), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow();

      expect(sendTransaction).not.toHaveBeenCalled();
    });

    // (e) Pre-send checks: 2x Gas buffer failure
    it('Step (e): fails with insufficient_balance when balance covers amountIn but lacks 2x gas fee buffer', async () => {
      const states: SwapTransactionState[] = [];
      const swapAmount = 500_000_000_000n;
      // Balance covers only swapAmount but none of the 2x gas fee buffer
      const rpcCall = createMockRpc({
        eth_getBalance: toHex(swapAmount),
      });
      const sendTransaction = vi.fn();

      await expect(
        executeGuardedSwap(createStandardSwapParams({ amountIn: swapAmount }), {
          userAddress: TEST_USER,
          rpcCall,
          sendTransaction,
          onStateChange: (s) => states.push(s),
        })
      ).rejects.toThrow(/Insufficient ETH balance/);

      expect(states).toContain('insufficient_balance');
      expect(sendTransaction).not.toHaveBeenCalled();
    });
  });

  // 4. User Rejection (4001)
  it('handles user rejection in wallet (code 4001) with transition to rejected', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc();
    const sendTransaction = async () => {
      const err = new Error('User rejected the request');
      (err as Record<string, unknown>).code = 4001;
      throw err;
    };

    await expect(
      executeGuardedSwap(createStandardSwapParams(), {
        userAddress: TEST_USER,
        rpcCall,
        sendTransaction,
        onStateChange: (s) => states.push(s),
      })
    ).rejects.toThrow(/code 4001/);

    expect(states).toContain('wallet_confirmation');
    expect(states).toContain('rejected');
    expect(states).not.toContain('submitted');
  });

  // 5. Reverted Receipt (status 0x0)
  it('marks transaction reverted when receipt status is 0x0', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x0',
        to: ROUTER_ADDRESS,
        from: TEST_USER,
        blockNumber: '0x100',
        transactionHash: '0xreverted_hash',
      },
    });
    const sendTransaction = async () => '0xreverted_hash';

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    expect(states).toContain('submitted');
    expect(states).toContain('pending');
    expect(states).toContain('reverted');
    expect(result.state).toBe('reverted');
  });

  // 6. Wrong "to" in receipt -> enters anomaly state and preserves status 0x1 (S-04)
  it('flags anomaly when destination "to" does not match Universal Router without overwriting status 0x1 (S-04)', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x1',
        to: '0x9999999999999999999999999999999999999999', // Attacker address
        from: TEST_USER,
        blockNumber: '0x100',
        transactionHash: '0xspoofed_hash',
      },
    });
    const sendTransaction = async () => '0xspoofed_hash';

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    expect(result.state).toBe('anomaly');
    expect(result.receipt?.status).toBe('0x1'); // Never overwritten to 0x0 per S-04!
    expect(result.anomalyReason).toContain('does not match Universal Router');
    expect(states).toContain('anomaly');
    expect(states).not.toContain('confirmed');
  });

  // 7. Wrong "from" in receipt -> enters anomaly state and preserves status 0x1 (S-04)
  it('flags anomaly when sender "from" does not match user address without overwriting status 0x1 (S-04)', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x1',
        to: ROUTER_ADDRESS,
        from: '0x8888888888888888888888888888888888888888', // Attacker sender
        blockNumber: '0x100',
        transactionHash: '0xspoofed_hash',
      },
    });
    const sendTransaction = async () => '0xspoofed_hash';

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    expect(result.state).toBe('anomaly');
    expect(result.receipt?.status).toBe('0x1');
    expect(result.anomalyReason).toContain('does not match expected user');
    expect(states).toContain('anomaly');
    expect(states).not.toContain('confirmed');
  });

  // S-05. Wrong "transactionHash" in receipt
  it('flags anomaly when receipt transactionHash does not match expected txHash (S-05)', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: {
        status: '0x1',
        to: ROUTER_ADDRESS,
        from: TEST_USER,
        blockNumber: '0x100',
        transactionHash: '0xmismatched_hash_from_provider',
      },
    });
    const sendTransaction = async () => '0xsubmitted_hash';

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      pollOptions: { timeoutMs: 1000, pollIntervalMs: 10 },
    });

    expect(result.state).toBe('anomaly');
    expect(result.receipt?.status).toBe('0x1');
    expect(result.anomalyReason).toContain('does not match expected txHash');
    expect(states).toContain('anomaly');
    expect(states).not.toContain('confirmed');
  });

  // S-06. Error mapping by code/details instead of message text
  it('maps errors by structured RobexAppError code and details rather than message string (S-06)', async () => {
    const states: SwapTransactionState[] = [];
    const customMessageError = new RobexAppError(
      'USER_ERROR',
      'Thông báo lỗi tiếng Việt không chứa chuỗi tiếng Anh',
      {
        subcode: 'INSUFFICIENT_BALANCE',
        requiredEth: '1000',
        userBalance: '500',
      }
    );

    const rpcCall = createMockRpc({
      eth_getBalance: () => {
        throw customMessageError;
      },
    });
    const sendTransaction = vi.fn();

    await expect(
      executeGuardedSwap(createStandardSwapParams(), {
        userAddress: TEST_USER,
        rpcCall,
        sendTransaction,
        onStateChange: (s) => states.push(s),
      })
    ).rejects.toThrow();

    expect(states).toContain('insufficient_balance');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  // 8. 180s Receipt Timeout
  it('transitions to timeout state when receipt polling exceeds window and preserves txHash', async () => {
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc({
      eth_getTransactionReceipt: null, // Always pending
    });
    const sendTransaction = async () => '0xtimeout_hash';

    const result = await executeGuardedSwap(createStandardSwapParams(), {
      userAddress: TEST_USER,
      rpcCall,
      sendTransaction,
      onStateChange: (s) => states.push(s),
      // Fast unit test options simulating timeout
      pollOptions: { timeoutMs: 30, pollIntervalMs: 10 },
    });

    expect(states).toContain('submitted');
    expect(states).toContain('pending');
    expect(states).toContain('timeout');
    expect(result.state).toBe('timeout');
    expect(result.txHash).toBe('0xtimeout_hash');
  });

  // 9. Receipt Parsing: USDG Transfer summing and minOut flag
  describe('Receipt USDG Transfer Log Parser & Slippage Check', () => {
    it('computes TRANSFER_EVENT_TOPIC dynamically with viem matching standard ERC20 Transfer', () => {
      expect(TRANSFER_EVENT_TOPIC).toBe(
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      );
    });

    it('sums multiple USDG transfer logs to user and flags slippageExceeded when below minOut', () => {
      const userTopics = encodeEventTopics({
        abi: TRANSFER_EVENT_ABI,
        eventName: 'Transfer',
        args: {
          from: ROUTER_ADDRESS as `0x${string}`,
          to: TEST_USER as `0x${string}`,
        },
      });

      const logs = [
        // Log 1: 500 USDG to user
        {
          address: USDG_ADDRESS,
          topics: userTopics,
          data: encodeAbiParameters([{ type: 'uint256' }], [500n]),
        },
        // Log 2: 600 USDG to user (sum = 1,100)
        {
          address: USDG_ADDRESS,
          topics: userTopics,
          data: encodeAbiParameters([{ type: 'uint256' }], [600n]),
        },
        // Log 3: transfer to another address (ignored)
        {
          address: USDG_ADDRESS,
          topics: encodeEventTopics({
            abi: TRANSFER_EVENT_ABI,
            eventName: 'Transfer',
            args: {
              from: ROUTER_ADDRESS as `0x${string}`,
              to: '0x1111111111111111111111111111111111111111' as `0x${string}`,
            },
          }),
          data: encodeAbiParameters([{ type: 'uint256' }], [9999n]),
        },
      ];

      const total = sumUsdgTransferLogs(logs, TEST_USER);
      expect(total).toBe(1100n);

      const verification = verifyAndParseReceipt(
        {
          status: '0x1',
          to: ROUTER_ADDRESS,
          from: TEST_USER,
          blockNumber: '0x1',
          transactionHash: '0xhash',
          logs,
        },
        {
          userAddress: TEST_USER,
          amountOutMinimum: 1122n, // 1,100 < 1,122 => slippageExceeded true
        }
      );

      expect(verification.confirmed).toBe(true);
      expect(verification.actualAmountReceived).toBe(1100n);
      expect(verification.slippageExceeded).toBe(true);
    });
  });

  // 10. Session Generation Guard Cancellation before submitted
  it('cancels execution before submitted if session is invalidated by account/chain change', async () => {
    let sessionActive = true;
    const states: SwapTransactionState[] = [];
    const rpcCall = createMockRpc();
    const sendTransaction = vi.fn();

    // Invalidate session right before wallet confirmation
    const isSessionActive = () => sessionActive;

    // Simulate session invalidation triggered concurrently
    sessionActive = false;

    await expect(
      executeGuardedSwap(createStandardSwapParams(), {
        userAddress: TEST_USER,
        rpcCall,
        sendTransaction,
        isSessionActive,
        onStateChange: (s) => states.push(s),
      })
    ).rejects.toThrow(/wallet session invalidated/);

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('pollTransactionReceipt resolves when receipt is found immediately', async () => {
    const mockRpc = async (method: string) => {
      if (method === 'eth_getTransactionReceipt') {
        return { status: '0x1', transactionHash: '0xhash' };
      }
      throw new Error('unexpected');
    };

    const result = await pollTransactionReceipt(mockRpc, '0xhash', {
      timeoutMs: 1000,
      pollIntervalMs: 10,
    });

    expect(result.status).toBe('found');
  });

  // S-07: User Rejection strict check
  it('does NOT treat "transaction rejected: insufficient funds" as user rejection (S-07)', () => {
    const nodeError = {
      message: 'transaction rejected: insufficient funds for gas * price + value',
    };
    expect(isUserRejectionError(nodeError)).toBe(false);

    // Exact user rejection variants pass
    expect(isUserRejectionError({ code: 4001 })).toBe(true);
    expect(isUserRejectionError({ code: '4001' })).toBe(true);
    expect(isUserRejectionError({ message: 'User rejected the request' })).toBe(true);
    expect(isUserRejectionError({ message: 'User denied transaction signature.' })).toBe(true);
  });

  // S-08: Log decoding safe failure handling
  it('skips malformed log data, flags decode failure, and never adds raw data (S-08)', () => {
    const malformedLog = {
      address: USDG_ADDRESS,
      topics: [
        TRANSFER_EVENT_TOPIC,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000008e94699c825a15275e720549ace1d37612dd0d71', // matches TEST_USER
      ],
      data: '0x12345678', // invalid length for uint256! decodeEventLog throws
    };

    const detailed = sumUsdgTransferLogsDetailed([malformedLog], TEST_USER);
    expect(detailed.totalReceived).toBe(0n);
    expect(detailed.decodeFailedLogsCount).toBe(1);

    // Standard function also returns 0n, never adds raw BigInt (305419896n)
    const total = sumUsdgTransferLogs([malformedLog], TEST_USER);
    expect(total).toBe(0n);

    const verification = verifyAndParseReceipt(
      {
        status: '0x1',
        to: ROUTER_ADDRESS,
        from: TEST_USER,
        blockNumber: '0x1',
        transactionHash: '0xhash',
        logs: [malformedLog],
      },
      {
        expectedRouter: ROUTER_ADDRESS,
        userAddress: TEST_USER,
        amountOutMinimum: 1000n,
      }
    );

    expect(verification.hasDecodeFailure).toBe(true);
    expect(verification.actualAmountReceived).toBe(0n);
  });
});

