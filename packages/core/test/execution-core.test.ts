import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeFunctionData, toFunctionSelector } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import * as coreExports from '../src/index.js';
import {
  RobexAppError,
  buildUniversalRouterSwapCalldata,
  decodeUniversalRouterSwapCalldata,
  runPreSendChecks,
  decodeRevertReason,
  extractRevertData,
  parseBigIntValue,
  PINNED_V4_POOL_KEY,
  DEFAULT_EXECUTION_DEADLINE_SECONDS,
  COMMANDS,
  ACTIONS_ETH_TO_USDG_HEX,
  EXACT_INPUT_SINGLE_ABI_PARAMS,
  SETTLE_ALL_ABI_PARAMS,
  TAKE_ALL_ABI_PARAMS,
  V4_SWAP_INPUT_ABI_PARAMS,
  UNIVERSAL_ROUTER_EXECUTE_ABI,
  ABSOLUTE_ETH_CAP_WEI,
  type BuildSwapCalldataParams,
} from '../src/index.js';
import { setInternalClockForTesting } from '../src/execution/build-swap-calldata.js';

describe('Universal Router Execution Core (@robex/core)', () => {
  const TEST_USER = '0x8e94699c825a15275e720549aCE1D37612dD0d71';
  const CHAIN_ID = UNISWAP_V4_TESTNET_QUOTE.chainId; // 46630
  const PINNED_ROUTER = UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const PINNED_ETH = UNISWAP_V4_TESTNET_QUOTE.nativeEth;
  const PINNED_USDG = UNISWAP_V4_TESTNET_QUOTE.usdg;
  const FROZEN_TIME = 1710000000n;

  beforeEach(() => {
    setInternalClockForTesting(() => FROZEN_TIME);
  });

  afterEach(() => {
    setInternalClockForTesting(null);
  });

  // Helper to construct a standard valid swap payload
  function createStandardSwap(overrides?: Partial<BuildSwapCalldataParams>) {
    return buildUniversalRouterSwapCalldata({
      chainId: CHAIN_ID,
      amountIn: 500_000_000_000n, // 0.0000005 ETH <= 0.0001 ETH cap
      amountOut: 1128n, // 1,128 raw Paxos USDG (minOut = 1,122 at 50 bps)
      ...overrides,
    });
  }

  // 1. Reference Calldata Encoding & Input Constraints (E-01, E-02, E-03, QA-01, QA-06)
  describe('1. Reference Calldata Encoding & Input Constraints', () => {
    it('does not export any test-only hooks containing "ForTesting" in public @robex/core exports (F-R2-01)', () => {
      const publicExportKeys = Object.keys(coreExports);
      const testHooks = publicExportKeys.filter((key) => key.includes('ForTesting'));
      expect(testHooks).toEqual([]);
    });

    it('produces deterministic calldata matching the reference execution layout and always targets pinned router (E-01)', () => {
      const amountIn = 500_000_000_000n; // 0.0000005 ETH
      const amountOut = 1128n;
      const deadline = FROZEN_TIME + 30n; // Valid deadline within (now, now + 60s]

      const result = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn,
        amountOut,
        deadline,
      });

      // E-01: Always uses pinned universalRouter
      expect(result.to.toLowerCase()).toBe(PINNED_ROUTER.toLowerCase());
      expect(result.value).toBe(amountIn);
      expect(result.amountIn).toBe(amountIn);
      expect(result.amountOutMinimum).toBe(1122n); // Derived via 50 bps slippage
      expect(result.deadline).toBe(deadline);

      // Verify function selector is execute(bytes,bytes[],uint256) = 0x3593564c
      expect(result.data.slice(0, 10)).toBe('0x3593564c');

      // Decode the generated calldata and verify exact structure
      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.commands).toBe(COMMANDS.V4_SWAP);
      expect(decoded.actions).toBe(ACTIONS_ETH_TO_USDG_HEX);
      expect(decoded.deadline).toBe(deadline);
      expect(decoded.amountIn).toBe(amountIn);
      expect(decoded.amountOutMinimum).toBe(1122n);
      expect(decoded.zeroForOne).toBe(true);
      expect(decoded.poolKey.currency0.toLowerCase()).toBe(PINNED_ETH.toLowerCase());
      expect(decoded.poolKey.currency1.toLowerCase()).toBe(PINNED_USDG.toLowerCase());
      expect(decoded.poolKey.feePips).toBe(3000);
      expect(decoded.poolKey.tickSpacing).toBe(60);
      expect(decoded.poolKey.hooks.toLowerCase()).toBe(PINNED_ETH.toLowerCase());

      // Settle and Take checks
      expect(decoded.settleCurrency.toLowerCase()).toBe(PINNED_ETH.toLowerCase());
      expect(decoded.settleMaxAmount).toBe(amountIn);
      expect(decoded.takeCurrency.toLowerCase()).toBe(PINNED_USDG.toLowerCase());
      expect(decoded.takeMinAmount).toBe(1122n);
    });

    it('derives amountOutMinimum strictly from quote amountOut and slippage policy (E-03)', () => {
      // 1,128 raw USDG with custom 100 bps (1%) slippage: 1128 * 9900 / 10000 = 1116n
      const result = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
        slippage: { slippageBps: 100 },
      });

      expect(result.amountOutMinimum).toBe(1116n);

      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.amountOutMinimum).toBe(1116n);
      expect(decoded.takeMinAmount).toBe(1116n);
    });

    it('sets default deadline to current internal clock + 60s (Decision D1, QA-01)', () => {
      const result = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
      });

      expect(result.deadline).toBe(FROZEN_TIME + DEFAULT_EXECUTION_DEADLINE_SECONDS);
      expect(result.deadline).toBe(FROZEN_TIME + 60n);

      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.deadline).toBe(FROZEN_TIME + 60n);
    });

    it('enforces deadline override within (now, now + 60s] and rejects invalid deadlines (E-03, QA-01)', () => {
      // Valid deadline: now + 45s
      const valid = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
        deadline: FROZEN_TIME + 45n,
      });
      expect(valid.deadline).toBe(FROZEN_TIME + 45n);

      // Boundary valid: exactly now + 60s
      const boundaryValid = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
        deadline: FROZEN_TIME + 60n,
      });
      expect(boundaryValid.deadline).toBe(FROZEN_TIME + 60n);

      // Rejected: deadline equal to current timestamp (deadline <= now)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          deadline: FROZEN_TIME,
        })
      ).toThrow(RobexAppError);

      // Rejected: deadline in the past (deadline < now)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          deadline: FROZEN_TIME - 1n,
        })
      ).toThrow(RobexAppError);

      // Rejected: deadline > now + 60s (e.g. now + 61s)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          deadline: FROZEN_TIME + 61n,
        })
      ).toThrow(RobexAppError);
    });

    it('enforces required chainId == 46630 and rejects missing or other chains (E-02)', () => {
      // Mainnet 4663
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: 4663,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
        })
      ).toThrow(RobexAppError);

      // Ethereum Mainnet 1
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: 1,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
        })
      ).toThrow(RobexAppError);

      // Untyped missing chainId
      expect(() =>
        buildUniversalRouterSwapCalldata({
          // @ts-expect-error testing missing runtime chainId
          chainId: undefined,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
        })
      ).toThrow(RobexAppError);
    });

    it('enforces Decision D2 hard cap: amountIn <= 0.0001 ETH (QA-06)', () => {
      // Exactly at cap: 100_000_000_000_000n (0.0001 ETH)
      const atCap = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: ABSOLUTE_ETH_CAP_WEI,
        amountOut: 224486n,
      });
      expect(atCap.amountIn).toBe(ABSOLUTE_ETH_CAP_WEI);

      // Above cap: 0.0001 ETH + 1 wei
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: ABSOLUTE_ETH_CAP_WEI + 1n,
          amountOut: 224486n,
        })
      ).toThrow(RobexAppError);

      // Far above cap: 1 ETH
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 1_000_000_000_000_000_000n,
          amountOut: 2244860000n,
        })
      ).toThrow(RobexAppError);
    });
  });

  // 2. Decode Round-Trip
  describe('2. Decode Round-Trip', () => {
    it('round-trips poolKey, amountIn, amountOutMinimum, and recipient settlements exactly', () => {
      const amountIn = 100_000_000_000_000n; // 0.0001 ETH
      const amountOut = 2_255n;
      const deadline = FROZEN_TIME + 50n;

      const built = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn,
        amountOut,
        deadline,
      });

      const decoded = decodeUniversalRouterSwapCalldata(built.data);

      expect(decoded.poolKey).toEqual(PINNED_V4_POOL_KEY);
      expect(decoded.amountIn).toBe(amountIn);
      expect(decoded.amountOutMinimum).toBe(built.amountOutMinimum);
      expect(decoded.deadline).toBe(deadline);
      expect(decoded.zeroForOne).toBe(true);
      expect(decoded.hookData).toBe('0x');
      expect(decoded.settleMaxAmount).toBe(amountIn);
      expect(decoded.takeMinAmount).toBe(built.amountOutMinimum);
    });
  });

  // 3. Pool Key Security Rejections (assertPinnedPoolKey)
  describe('3. Pool Key Security Rejections (assertPinnedPoolKey)', () => {
    it('rejects poolKey with modified currency0', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            currency0: '0x1111111111111111111111111111111111111111',
          },
        })
      ).toThrow(RobexAppError);
    });

    it('rejects poolKey with modified currency1', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            currency1: '0x2222222222222222222222222222222222222222',
          },
        })
      ).toThrow(RobexAppError);
    });

    it('rejects poolKey with modified fee (e.g. 500 instead of pinned 3000)', () => {
      try {
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            feePips: 500,
          },
        });
        expect.unreachable('Should fail pool key assert');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects poolKey with modified tickSpacing (e.g. 10 instead of pinned 60)', () => {
      try {
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            tickSpacing: 10,
          },
        });
        expect.unreachable('Should fail pool key assert');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects poolKey with non-zero custom hooks', () => {
      try {
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            hooks: '0x089dfb78d67963d5461c9a009529b6d8c9c76880',
          },
        });
        expect.unreachable('Should fail pool key assert');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects poolKey with malformed address string (QA-07)', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            currency0: 'not-an-address',
          },
        })
      ).toThrow(RobexAppError);
    });
  });

  // 4. Error ABI Selector Verification (QA-04) & Revert Decoding
  describe('4. Error ABI Selector Verification (QA-04) & Revert Decoding', () => {
    it('computes exact error selectors with viem matching live contract ABI (QA-04)', () => {
      // Proves comment accuracy and viem selector computation without hand-writing
      expect(toFunctionSelector('V4TooLittleReceived(uint256,uint256)')).toBe('0x8b063d73');
      expect(toFunctionSelector('ExecutionFailed(uint256,bytes)')).toBe('0x2c4029e9');
      expect(toFunctionSelector('TransactionDeadlinePassed()')).toBe('0x5bf6f916');
      expect(toFunctionSelector('Error(string)')).toBe('0x08c379a0');
      expect(toFunctionSelector('Panic(uint256)')).toBe('0x4e487b71');
    });

    it('decodes TransactionDeadlinePassed selector 0x5bf6f916 correctly (QA-04)', () => {
      const revertData = '0x5bf6f916';
      const decoded = decodeRevertReason(revertData);
      expect(decoded.errorName).toBe('TransactionDeadlinePassed');
      expect(decoded.message).toContain('Transaction deadline passed');
      expect(decoded.rawData).toBe('0x5bf6f916');
    });

    it('extracts hex revert data strictly from structured error fields and rejects non-hex (QA-05)', () => {
      const hexData =
        '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462';

      // 1. obj.data
      expect(extractRevertData({ data: hexData })).toBe(hexData);

      // 2. obj.error.data
      expect(extractRevertData({ error: { data: hexData } })).toBe(hexData);

      // 3. obj.cause.data
      expect(extractRevertData({ cause: { data: hexData } })).toBe(hexData);

      // 4. obj.response.data
      expect(extractRevertData({ response: { data: hexData } })).toBe(hexData);

      // 5. Raw hex string itself
      expect(extractRevertData(hexData)).toBe(hexData);

      // QA-05: Non-hex string in obj.data returns null
      expect(extractRevertData({ data: '0xZZZZZZZZZZ' })).toBeNull();
      expect(extractRevertData('0xZZZZZZZZZZ')).toBeNull();
    });

    it('does NOT extract revert data via regex from message text (E-09)', () => {
      const hexInMessage = {
        message: 'execution reverted: 0x8b063d730000000000000000000000000000000000000000000000000000000000000463',
      };
      expect(extractRevertData(hexInMessage)).toBeNull();
    });

    it('decodes V4TooLittleReceived error on simulation revert and formats human-readable message', () => {
      const revertData =
        '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462';

      const decoded = decodeRevertReason(revertData);
      expect(decoded.errorName).toBe('V4TooLittleReceived');
      expect(decoded.args).toEqual({ minAmountOut: '1123', amountOut: '1122' });
      expect(decoded.message).toContain('output 1122 is below minimum required 1123');
    });

    it('decodes standard Error(string) revert message', () => {
      const revertData =
        '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d506f6f6c20697320656d70747900000000000000000000000000000000000000';

      const decoded = decodeRevertReason(revertData);
      expect(decoded.errorName).toBe('Error');
      expect(decoded.message).toContain('Pool is empty');
    });

    it('parses RPC quantities strictly and rejects negative or non-hex values with RobexAppError (QA-05)', () => {
      // Valid hex
      expect(parseBigIntValue('0x203a0', 'gas')).toBe(132000n);
      expect(parseBigIntValue('0x0', 'balance')).toBe(0n);

      // Negative values rejected
      expect(() => parseBigIntValue('-5', 'gasPrice')).toThrow(RobexAppError);
      expect(() => parseBigIntValue('-0x1', 'gasLimit')).toThrow(RobexAppError);
      expect(() => parseBigIntValue(-10, 'gasPrice')).toThrow(RobexAppError);
      expect(() => parseBigIntValue(-10n, 'gasPrice')).toThrow(RobexAppError);

      // Non-hex strings rejected
      expect(() => parseBigIntValue('0xZZZZ', 'balance')).toThrow(RobexAppError);
      expect(() => parseBigIntValue('invalid', 'balance')).toThrow(RobexAppError);
    });
  });

  // 5. Pre-Send Checks Execution & Policy Enforcement
  describe('5. Pre-Send Checks Execution & Policy Enforcement', () => {
    it('calls eth_chainId first and fails closed when chainId is not 46630 (E-02, E-04)', async () => {
      const swap = createStandardSwap();

      // Mock returns chain ID 1 (Ethereum Mainnet) instead of 46630
      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0x1';
        throw new Error('Should not have called subsequent RPC method: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected mismatched chain');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('CHAIN_ERROR');
        expect(appErr.message).toContain('connected chain 1 does not match required chain 46630');
      }
    });

    it('enforces byte-for-byte equality with canonical build output (QA-02)', async () => {
      const swap = createStandardSwap();

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      // Tampered calldata (substitute 1 byte)
      const tamperedCalldata = (swap.data.slice(0, swap.data.length - 2) + '00') as `0x${string}`;

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: tamperedCalldata,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected byte mismatch');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
        expect((err as RobexAppError).message).toContain('not byte-for-byte equal');
      }
    });

    it('checks balance >= amountIn BEFORE simulating and fails without calling eth_call (E-05)', async () => {
      const swap = createStandardSwap();
      let ethCallInvoked = false;

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_getBalance') return '0x0'; // 0 balance: insufficient even for amountIn
        if (method === 'eth_call') {
          ethCallInvoked = true;
          return '0x';
        }
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have failed on balance check before sim');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('USER_ERROR');
        expect(appErr.message).toContain('Insufficient ETH balance for swap amount');
        expect(ethCallInvoked).toBe(false);
      }
    });

    it('decodes V4TooLittleReceived error during simulation revert and fails closed (E-04, E-09)', async () => {
      const swap = createStandardSwap();
      const revertData =
        '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462';

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_getBalance') return '0x10000000000000000'; // Plenty of ETH
        if (method === 'eth_call') {
          throw {
            code: 3,
            message: 'execution reverted',
            data: revertData,
          };
        }
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have thrown on simulation revert');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('QUOTE_ERROR');
        expect(appErr.message).toContain('V4TooLittleReceived');
        expect(appErr.details?.revert).toMatchObject({
          errorName: 'V4TooLittleReceived',
          args: { minAmountOut: '1123', amountOut: '1122' },
        });
      }
    });

    it('enforces 2x gas buffer check after estimateGas when user balance covers amountIn but not buffer (E-05, Decision D3)', async () => {
      const swap = createStandardSwap();
      const estimatedGas = 132_000n;
      const gasPrice = 10_000_000n; // 10 Mwei
      const estimatedGasFee = estimatedGas * gasPrice; // 1,320,000,000,000 wei
      const requiredEth = swap.amountIn + 2n * estimatedGasFee;

      // Balance has enough for amountIn, but not enough for amountIn + 2x gas fee buffer
      const insufficientBalance = swap.amountIn + estimatedGasFee; // Only 1x buffer

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_getBalance') return `0x${insufficientBalance.toString(16)}`;
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0'; // 132,000
        if (method === 'eth_gasPrice') return '0x989680'; // 10,000,000 wei
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have failed 2x buffer check');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('USER_ERROR');
        expect(appErr.message).toContain('Insufficient ETH balance for swap and gas buffer');
        expect(appErr.details).toMatchObject({
          requiredEth: requiredEth.toString(),
          userBalance: insufficientBalance.toString(),
          bufferMultiplier: 2,
        });
      }
    });

    it('succeeds when ETH balance satisfies amountIn + 2 x estimated gas fee (Decision D3)', async () => {
      const swap = createStandardSwap();
      const estimatedGas = 132_000n;
      const gasPrice = 10_000_000n;
      const estimatedGasFee = estimatedGas * gasPrice;
      const requiredEth = swap.amountIn + 2n * estimatedGasFee;
      const sufficientBalance = requiredEth + 1_000_000_000_000n;

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_getBalance') return `0x${sufficientBalance.toString(16)}`;
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0'; // 132,000
        if (method === 'eth_gasPrice') return '0x989680'; // 10,000,000 wei
        throw new Error('Unexpected RPC call: ' + method);
      };

      const result = await runPreSendChecks({
        chainId: CHAIN_ID,
        userAddress: TEST_USER,
        amountIn: swap.amountIn,
        amountOut: 1128n,
        calldata: swap.data,
        rpcCall: mockRpcCall,
      });

      expect(result.simulated).toBe(true);
      expect(result.estimatedGas).toBe(estimatedGas);
      expect(result.gasPrice).toBe(gasPrice);
      expect(result.estimatedGasFee).toBe(estimatedGasFee);
      expect(result.requiredEth).toBe(requiredEth);
      expect(result.userBalance).toBe(sufficientBalance);
    });
  });

  // 6. QA Reproduced Bypass Tests (QA-01 through QA-07)
  describe('6. QA Reproduced Bypass Tests', () => {
    // Bypass 1: currentTimestamp far future
    it('QA Bypass 1: prevents shifting now to far future via public API (QA-01, F-R2-02)', () => {
      // On commit 102a6fa, caller could pass currentTimestamp: now + 31_536_000n in params.
      // In 1bb1846+ (F-R2-02), unknown parameter keys are strictly rejected at runtime with RobexAppError (USER_ERROR).
      try {
        // @ts-expect-error - testing runtime rejection of unknown key currentTimestamp
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          currentTimestamp: FROZEN_TIME + 31_536_000n,
        });
        expect.unreachable('Should have rejected unknown parameter key currentTimestamp');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect((err as RobexAppError).message).toContain('currentTimestamp');
      }
    });

    // Bypass 2: tampered minOut = 1
    it('QA Bypass 2: rejects calldata with tampered minOut = 1 (QA-02)', async () => {
      // Craft execute calldata with minAmountOut = 1 and takeMinAmount = 1
      const param0 = encodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, [
        {
          poolKey: {
            currency0: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
            currency1: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
            fee: PINNED_V4_POOL_KEY.feePips,
            tickSpacing: PINNED_V4_POOL_KEY.tickSpacing,
            hooks: PINNED_V4_POOL_KEY.hooks as `0x${string}`,
          },
          zeroForOne: true,
          amountIn: 500_000_000_000n,
          amountOutMinimum: 1n, // Tampered minOut = 1
          hookData: '0x',
        },
      ]);
      const param1 = encodeAbiParameters(SETTLE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
          maxAmount: 500_000_000_000n,
        },
      ]);
      const param2 = encodeAbiParameters(TAKE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
          minAmount: 1n, // Tampered takeMin = 1
        },
      ]);
      const input0 = encodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, [
        ACTIONS_ETH_TO_USDG_HEX,
        [param0, param1, param2],
      ]);
      const tamperedCalldata = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
        functionName: 'execute',
        args: [COMMANDS.V4_SWAP, [input0], FROZEN_TIME + 60n],
      });

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: 500_000_000_000n,
          amountOut: 1128n, // Quote says 1128n (minOut should be 1122n)
          calldata: tamperedCalldata,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected tampered minOut = 1');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
        expect((err as RobexAppError).message).toContain('not byte-for-byte equal');
      }
    });

    // Bypass 3: deadline +1y
    it('QA Bypass 3: rejects calldata with deadline in the far future (+1 year) (QA-02)', async () => {
      // Calldata crafted with deadline = now + 31_536_000n
      const farFutureDeadline = FROZEN_TIME + 31_536_000n;
      const param0 = encodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, [
        {
          poolKey: {
            currency0: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
            currency1: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
            fee: PINNED_V4_POOL_KEY.feePips,
            tickSpacing: PINNED_V4_POOL_KEY.tickSpacing,
            hooks: PINNED_V4_POOL_KEY.hooks as `0x${string}`,
          },
          zeroForOne: true,
          amountIn: 500_000_000_000n,
          amountOutMinimum: 1122n,
          hookData: '0x',
        },
      ]);
      const param1 = encodeAbiParameters(SETTLE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
          maxAmount: 500_000_000_000n,
        },
      ]);
      const param2 = encodeAbiParameters(TAKE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
          minAmount: 1122n,
        },
      ]);
      const input0 = encodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, [
        ACTIONS_ETH_TO_USDG_HEX,
        [param0, param1, param2],
      ]);
      const calldataWith1yDeadline = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
        functionName: 'execute',
        args: [COMMANDS.V4_SWAP, [input0], farFutureDeadline],
      });

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          calldata: calldataWith1yDeadline,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected deadline +1 year');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect((err as RobexAppError).message).toContain('exceeds maximum 60s execution window');
      }
    });

    // Bypass 4: deadline 0
    it('QA Bypass 4: rejects calldata with deadline 0 (QA-02)', async () => {
      const param0 = encodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, [
        {
          poolKey: {
            currency0: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
            currency1: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
            fee: PINNED_V4_POOL_KEY.feePips,
            tickSpacing: PINNED_V4_POOL_KEY.tickSpacing,
            hooks: PINNED_V4_POOL_KEY.hooks as `0x${string}`,
          },
          zeroForOne: true,
          amountIn: 500_000_000_000n,
          amountOutMinimum: 1122n,
          hookData: '0x',
        },
      ]);
      const param1 = encodeAbiParameters(SETTLE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
          maxAmount: 500_000_000_000n,
        },
      ]);
      const param2 = encodeAbiParameters(TAKE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
          minAmount: 1122n,
        },
      ]);
      const input0 = encodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, [
        ACTIONS_ETH_TO_USDG_HEX,
        [param0, param1, param2],
      ]);
      const calldataWith0Deadline = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
        functionName: 'execute',
        args: [COMMANDS.V4_SWAP, [input0], 0n],
      });

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          calldata: calldataWith0Deadline,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected deadline 0');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect((err as RobexAppError).message).toContain('has expired');
      }
    });

    // Bypass 5: hookData
    it('QA Bypass 5: rejects calldata with non-empty hookData (QA-02)', async () => {
      const param0 = encodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, [
        {
          poolKey: {
            currency0: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
            currency1: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
            fee: PINNED_V4_POOL_KEY.feePips,
            tickSpacing: PINNED_V4_POOL_KEY.tickSpacing,
            hooks: PINNED_V4_POOL_KEY.hooks as `0x${string}`,
          },
          zeroForOne: true,
          amountIn: 500_000_000_000n,
          amountOutMinimum: 1122n,
          hookData: '0x1234', // Non-empty hookData injected
        },
      ]);
      const param1 = encodeAbiParameters(SETTLE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency0 as `0x${string}`,
          maxAmount: 500_000_000_000n,
        },
      ]);
      const param2 = encodeAbiParameters(TAKE_ALL_ABI_PARAMS, [
        {
          currency: PINNED_V4_POOL_KEY.currency1 as `0x${string}`,
          minAmount: 1122n,
        },
      ]);
      const input0 = encodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, [
        ACTIONS_ETH_TO_USDG_HEX,
        [param0, param1, param2],
      ]);
      const calldataWithHookData = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
        functionName: 'execute',
        args: [COMMANDS.V4_SWAP, [input0], FROZEN_TIME + 60n],
      });

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          calldata: calldataWithHookData,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected calldata with non-empty hookData');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
        expect((err as RobexAppError).message).toContain('not byte-for-byte equal');
      }
    });

    // Bypass 6: trailing bytes
    it('QA Bypass 6: rejects calldata with trailing garbage bytes (QA-02)', async () => {
      const swap = createStandardSwap();
      const calldataWithTrailingBytes = (swap.data + 'deadbeef') as `0x${string}`;

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: calldataWithTrailingBytes,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected calldata with trailing bytes');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
        expect((err as RobexAppError).message).toContain('not byte-for-byte equal');
      }
    });

    // Bypass 7: gasPrice 0
    it('QA Bypass 7: prevents caller from zeroing gasPrice override to wipe out 2x buffer (QA-03, F-R2-02)', async () => {
      const swap = createStandardSwap();
      // On commit 102a6fa, caller could pass gasPrice: 0n in PreSendCheckParams to bypass buffer.
      // In 1bb1846+ (F-R2-02), unknown parameter keys are strictly rejected at runtime with RobexAppError (USER_ERROR).
      const mockRpcCall = async (method: string) => {
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
          // @ts-expect-error - testing runtime rejection of unknown key gasPrice
          gasPrice: 0n,
        });
        expect.unreachable('Should have rejected unknown parameter key gasPrice');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect((err as RobexAppError).message).toContain('gasPrice');
      }
    });

    // Bypass 8: huge userBalance
    it('QA Bypass 8: prevents caller from supplying huge userBalance override to bypass real wallet balance (QA-03, F-R2-02)', async () => {
      const swap = createStandardSwap();
      // On commit 102a6fa, caller could pass userBalance: 10n**30n in PreSendCheckParams to bypass balance checks.
      // In 1bb1846+ (F-R2-02), unknown parameter keys are strictly rejected at runtime with RobexAppError (USER_ERROR).
      const mockRpcCall = async (method: string) => {
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
          // @ts-expect-error - testing runtime rejection of unknown key userBalance
          userBalance: 10n**30n,
        });
        expect.unreachable('Should have rejected unknown parameter key userBalance');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect((err as RobexAppError).message).toContain('userBalance');
      }
    });

    // Bypass 9: negative gasPrice
    it('QA Bypass 9: rejects negative gasPrice returned from RPC (QA-05)', async () => {
      const swap = createStandardSwap();

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_getBalance') return '0x10000000000000000';
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0';
        if (method === 'eth_gasPrice') return '-5'; // Negative gas price from faulty/malicious RPC
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          amountOut: 1128n,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected negative gasPrice');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('PROVIDER_ERROR');
        expect((err as RobexAppError).message).toContain('gasPrice from RPC cannot be negative');
      }
    });

    // Bypass 10: amountIn above D2
    it('QA Bypass 10: rejects amountIn exceeding 0.0001 ETH cap (Decision D2, QA-06)', async () => {
      // 1 ETH input (far above 0.0001 ETH cap)
      const excessiveAmountIn = 1_000_000_000_000_000_000n;

      // 1. buildUniversalRouterSwapCalldata rejects it
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: excessiveAmountIn,
          amountOut: 1128n,
        })
      ).toThrow(RobexAppError);

      // 2. runPreSendChecks rejects it
      const mockRpcCall = async () => '0x';
      try {
        await runPreSendChecks({
          chainId: CHAIN_ID,
          userAddress: TEST_USER,
          amountIn: excessiveAmountIn,
          amountOut: 1128n,
          calldata: '0x3593564c',
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected amountIn > 0.0001 ETH');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect((err as RobexAppError).message).toContain('exceeds maximum allowed limit');
      }
    });

    it('strictly rejects other prohibited/unknown parameter keys in buildUniversalRouterSwapCalldata and runPreSendChecks (F-R2-02)', async () => {
      const swap = createStandardSwap();
      const mockRpcCall = async () => '0x';

      // Test buildUniversalRouterSwapCalldata rejections: routerAddress, amountOutMinimum, gasPrice, userBalance, currentTimestamp
      const buildProhibitedKeys = ['routerAddress', 'amountOutMinimum', 'gasPrice', 'userBalance', 'currentTimestamp', 'unknownKey'];
      for (const badKey of buildProhibitedKeys) {
        expect(() =>
          // @ts-expect-error - testing prohibited key
          buildUniversalRouterSwapCalldata({
            chainId: CHAIN_ID,
            amountIn: 500_000_000_000n,
            amountOut: 1128n,
            [badKey]: 'test',
          })
        ).toThrow(RobexAppError);
      }

      // Test runPreSendChecks rejections: routerAddress, amountOutMinimum, currentTimestamp, gasPrice, userBalance, unknownKey
      const preSendProhibitedKeys = ['routerAddress', 'amountOutMinimum', 'currentTimestamp', 'gasPrice', 'userBalance', 'unknownKey'];
      for (const badKey of preSendProhibitedKeys) {
        await expect(
          runPreSendChecks({
            chainId: CHAIN_ID,
            userAddress: TEST_USER,
            amountIn: swap.amountIn,
            amountOut: 1128n,
            calldata: swap.data,
            rpcCall: mockRpcCall,
            // @ts-expect-error - testing prohibited key
            [badKey]: 'test',
          })
        ).rejects.toThrow(RobexAppError);
      }
    });
  });
});

