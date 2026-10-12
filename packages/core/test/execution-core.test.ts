import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeFunctionData } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import {
  RobexAppError,
  buildUniversalRouterSwapCalldata,
  decodeUniversalRouterSwapCalldata,
  runPreSendChecks,
  decodeRevertReason,
  extractRevertData,
  PINNED_V4_POOL_KEY,
  DEFAULT_EXECUTION_DEADLINE_SECONDS,
  COMMANDS,
  ACTIONS_ETH_TO_USDG_HEX,
  EXACT_INPUT_SINGLE_ABI_PARAMS,
  SETTLE_ALL_ABI_PARAMS,
  TAKE_ALL_ABI_PARAMS,
  V4_SWAP_INPUT_ABI_PARAMS,
  UNIVERSAL_ROUTER_EXECUTE_ABI,
  type BuildSwapCalldataParams,
} from '../src/index.js';

describe('Universal Router Execution Core (@robex/core)', () => {
  const TEST_USER = '0x8e94699c825a15275e720549aCE1D37612dD0d71';
  const CHAIN_ID = UNISWAP_V4_TESTNET_QUOTE.chainId; // 46630
  const PINNED_ROUTER = UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const PINNED_ETH = UNISWAP_V4_TESTNET_QUOTE.nativeEth;
  const PINNED_USDG = UNISWAP_V4_TESTNET_QUOTE.usdg;

  // Helper to construct a standard valid swap payload for pre-send checks
  function createStandardSwap(overrides?: Partial<BuildSwapCalldataParams>) {
    return buildUniversalRouterSwapCalldata({
      chainId: CHAIN_ID,
      amountIn: 500_000_000_000n, // 0.0000005 ETH
      amountOut: 1128n, // 1,128 raw Paxos USDG (minOut = 1,122 at 50 bps)
      currentTimestamp: 1710000000n,
      ...overrides,
    });
  }

  // 1. Reference Calldata Encoding & Constraints (E-01, E-02, E-03)
  describe('1. Reference Calldata Encoding & Input Constraints', () => {
    it('produces deterministic calldata matching the reference execution layout and always targets pinned router (E-01)', () => {
      const amountIn = 500_000_000_000n; // 0.0000005 ETH
      const amountOut = 1128n;
      const currentTimestamp = 1710000000n;
      const deadline = currentTimestamp + 30n; // Valid deadline within (now, now + 60s]

      const result = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn,
        amountOut,
        currentTimestamp,
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
        currentTimestamp: 1710000000n,
      });

      expect(result.amountOutMinimum).toBe(1116n);

      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.amountOutMinimum).toBe(1116n);
      expect(decoded.takeMinAmount).toBe(1116n);
    });

    it('sets default deadline to currentTimestamp + 60s (Decision D1)', () => {
      const currentTimestamp = 1710000000n;
      const result = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
        currentTimestamp,
      });

      expect(result.deadline).toBe(currentTimestamp + DEFAULT_EXECUTION_DEADLINE_SECONDS);
      expect(result.deadline).toBe(currentTimestamp + 60n);

      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.deadline).toBe(currentTimestamp + 60n);
    });

    it('enforces deadline override within (now, now + 60s] and rejects invalid deadlines (E-03)', () => {
      const now = 1710000000n;

      // Valid deadline: now + 45s
      const valid = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
        currentTimestamp: now,
        deadline: now + 45n,
      });
      expect(valid.deadline).toBe(now + 45n);

      // Boundary valid: exactly now + 60s
      const boundaryValid = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
        currentTimestamp: now,
        deadline: now + 60n,
      });
      expect(boundaryValid.deadline).toBe(now + 60n);

      // Rejected: deadline equal to current timestamp (deadline <= now)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          currentTimestamp: now,
          deadline: now,
        })
      ).toThrow(RobexAppError);

      // Rejected: deadline in the past (deadline < now)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          currentTimestamp: now,
          deadline: now - 1n,
        })
      ).toThrow(RobexAppError);

      // Rejected: deadline > now + 60s (e.g. now + 61s)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          currentTimestamp: now,
          deadline: now + 61n,
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

    it('rejects invalid or zero amountIn and amountOut', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 0n,
          amountOut: 1128n,
        })
      ).toThrow(RobexAppError);

      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 0n,
        })
      ).toThrow(RobexAppError);

      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: -100n,
          amountOut: 1128n,
        })
      ).toThrow(RobexAppError);
    });
  });

  // 2. Decode Round-Trip
  describe('2. Decode Round-Trip', () => {
    it('round-trips poolKey, amountIn, amountOutMinimum, and recipient settlements exactly', () => {
      const amountIn = 1_000_000_000_000n;
      const amountOut = 2_255n;
      const currentTimestamp = 1800000000n;
      const deadline = currentTimestamp + 50n;

      const built = buildUniversalRouterSwapCalldata({
        chainId: CHAIN_ID,
        amountIn,
        amountOut,
        currentTimestamp,
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

  // 3. Pool Key Security Rejections (E-10)
  describe('3. Pool Key Security Rejections (E-10 Policy Overrides)', () => {
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
  });

  // 4. Structured-Only Revert Extraction (E-09) & Revert Decoding
  describe('4. Structured Revert Extraction (E-09) & Decoding', () => {
    it('extracts hex revert data strictly from structured error fields (E-09)', () => {
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
    });

    it('does NOT extract revert data via regex from message text when structured field is absent (E-09)', () => {
      const hexInMessage = {
        message: 'execution reverted: 0x8b063d730000000000000000000000000000000000000000000000000000000000000463',
      };
      // E-09: regex on message text is removed; should return null
      expect(extractRevertData(hexInMessage)).toBeNull();

      // Plain string with embedded hex
      const plainString = 'Error occurred at tx hash 0x8b063d7300000000000000000000000000000000';
      expect(extractRevertData(plainString)).toBeNull();
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
  });

  // 5. Pre-Send Checks (E-01, E-02, E-04, E-05, E-10)
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
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
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

    it('fails closed when eth_chainId call fails (E-04)', async () => {
      const swap = createStandardSwap();

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') throw new Error('RPC connection refused');
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have failed closed on chainId error');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('CHAIN_ERROR');
      }
    });

    it('decodes calldata and re-verifies amountIn, settleMaxAmount, and takeMinAmount (E-04)', async () => {
      const swap = createStandardSwap();

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626'; // 46630 in hex
        throw new Error('Unexpected RPC call: ' + method);
      };

      // Mismatched amountIn passed to pre-send checks vs what is encoded in calldata
      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: swap.amountIn + 1n, // Tampered amountIn
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected calldata amount mismatch');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
        expect((err as RobexAppError).message).toContain('Calldata amountIn does not match params.amountIn');
      }
    });

    it('fails closed when calldata is not a valid execute call or cannot be decoded (E-04)', async () => {
      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: 500_000_000_000n,
          calldata: '0x12345678', // Bogus calldata
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have failed closed');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
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
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          calldata: swap.data,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have failed on balance check before sim');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('USER_ERROR');
        expect(appErr.message).toContain('Insufficient ETH balance for swap amount');
        // E-05: Simulation must not have been executed!
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
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
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
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
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
        userAddress: TEST_USER,
        amountIn: swap.amountIn,
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

  // 6. Override Policy Bypass Proving Tests (E-10)
  describe('6. Policy Bypass Prevention Proving Tests (E-10)', () => {
    it('proves poolKey override cannot bypass policy in build calldata or pre-send checks', async () => {
      // 1. buildUniversalRouterSwapCalldata rejects poolKey override with altered fee
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            feePips: 10000, // 1% instead of pinned 0.3%
          },
        })
      ).toThrow(RobexAppError);

      // 2. runPreSendChecks rejects calldata if an attacker crafts calldata pointing to a different pool
      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        throw new Error('Unexpected RPC call: ' + method);
      };

      // Craft valid execute calldata with modified pool fee (e.g. 500)
      const tamperedPool = {
        ...PINNED_V4_POOL_KEY,
        feePips: 500,
      };
      const param0 = encodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, [
        {
          poolKey: {
            currency0: tamperedPool.currency0 as `0x${string}`,
            currency1: tamperedPool.currency1 as `0x${string}`,
            fee: tamperedPool.feePips,
            tickSpacing: tamperedPool.tickSpacing,
            hooks: tamperedPool.hooks as `0x${string}`,
          },
          zeroForOne: true,
          amountIn: 500_000_000_000n,
          amountOutMinimum: 1122n,
          hookData: '0x',
        },
      ]);
      const param1 = encodeAbiParameters(SETTLE_ALL_ABI_PARAMS, [
        {
          currency: tamperedPool.currency0 as `0x${string}`,
          maxAmount: 500_000_000_000n,
        },
      ]);
      const param2 = encodeAbiParameters(TAKE_ALL_ABI_PARAMS, [
        {
          currency: tamperedPool.currency1 as `0x${string}`,
          minAmount: 1122n,
        },
      ]);
      const input0 = encodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, [
        ACTIONS_ETH_TO_USDG_HEX,
        [param0, param1, param2],
      ]);
      const tamperedCalldata = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
        functionName: 'execute',
        args: [COMMANDS.V4_SWAP, [input0], 1710000060n],
      });

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: 500_000_000_000n,
          calldata: tamperedCalldata,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have rejected calldata with tampered pool fee');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
        expect((err as RobexAppError).message).toContain('Pool fee must match pinned 3000 fee pips');
      }
    });

    it('proves deadline override cannot bypass policy (must be > now and <= now + 60s)', () => {
      const now = 1710000000n;

      // Expired deadline
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          currentTimestamp: now,
          deadline: now - 3600n,
        })
      ).toThrow(RobexAppError);

      // Distant future deadline (> 60s)
      expect(() =>
        buildUniversalRouterSwapCalldata({
          chainId: CHAIN_ID,
          amountIn: 500_000_000_000n,
          amountOut: 1128n,
          currentTimestamp: now,
          deadline: now + 3600n,
        })
      ).toThrow(RobexAppError);
    });

    it('proves gasPrice override cannot bypass pre-simulation balance check or 2x gas buffer', async () => {
      const swap = createStandardSwap();

      // Passing gasPrice: 0n still enforces that userBalance >= amountIn
      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_getBalance') return '0x0'; // 0 balance
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          calldata: swap.data,
          gasPrice: 0n, // Zero gas price override attempt
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have enforced balance >= amountIn even with gasPrice = 0');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
      }
    });

    it('proves userBalance override cannot bypass insufficient balance checks', async () => {
      const swap = createStandardSwap();
      let ethCallCalled = false;

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_call') {
          ethCallCalled = true;
          return '0x';
        }
        throw new Error('Unexpected RPC call: ' + method);
      };

      // 1. userBalance override less than amountIn is blocked before simulation
      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: swap.amountIn,
          calldata: swap.data,
          userBalance: swap.amountIn - 1n,
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have blocked insufficient balance override');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('USER_ERROR');
        expect(ethCallCalled).toBe(false);
      }
    });
  });
});
