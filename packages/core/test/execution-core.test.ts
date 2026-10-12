import { describe, expect, it } from 'vitest';
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
} from '../src/index.js';

describe('Universal Router Execution Core (@robex/core)', () => {
  const TEST_USER = '0x8e94699c825a15275e720549aCE1D37612dD0d71';
  const PINNED_ROUTER = UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const PINNED_ETH = UNISWAP_V4_TESTNET_QUOTE.nativeEth;
  const PINNED_USDG = UNISWAP_V4_TESTNET_QUOTE.usdg;

  // 1. Reference encoding comparison
  describe('1. Reference Calldata Encoding', () => {
    it('produces deterministic calldata matching the reference execution layout', () => {
      const amountIn = 500000000000n; // 0.0000005 ETH
      const amountOutMinimum = 1122n; // 1,122 raw Paxos USDG
      const deadline = 2000000000n; // Pinned reference timestamp

      const result = buildUniversalRouterSwapCalldata({
        amountIn,
        amountOutMinimum,
        deadline,
      });

      expect(result.to.toLowerCase()).toBe(PINNED_ROUTER.toLowerCase());
      expect(result.value).toBe(amountIn);
      expect(result.amountIn).toBe(amountIn);
      expect(result.amountOutMinimum).toBe(amountOutMinimum);
      expect(result.deadline).toBe(deadline);

      // Verify function selector is execute(bytes,bytes[],uint256) = 0x3593564c
      expect(result.data.slice(0, 10)).toBe('0x3593564c');

      // Decode the generated calldata and verify exact structure
      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.commands).toBe(COMMANDS.V4_SWAP);
      expect(decoded.actions).toBe(ACTIONS_ETH_TO_USDG_HEX);
      expect(decoded.deadline).toBe(deadline);
      expect(decoded.amountIn).toBe(amountIn);
      expect(decoded.amountOutMinimum).toBe(amountOutMinimum);
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
      expect(decoded.takeMinAmount).toBe(amountOutMinimum);
    });

    it('derives amountOutMinimum from amountOut and default 50 bps slippage policy', () => {
      // 1,128 raw USDG with 50 bps (0.5%) slippage: 1128 * (10000 - 50) / 10000 = 1122n
      const result = buildUniversalRouterSwapCalldata({
        amountIn: 500000000000n,
        amountOut: 1128n,
        deadline: 2000000000n,
      });

      expect(result.amountOutMinimum).toBe(1122n);

      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.amountOutMinimum).toBe(1122n);
      expect(decoded.takeMinAmount).toBe(1122n);
    });

    it('sets default deadline to currentTimestamp + 60s (Decision D1)', () => {
      const currentTimestamp = 1710000000n;
      const result = buildUniversalRouterSwapCalldata({
        amountIn: 500000000000n,
        amountOutMinimum: 1122n,
        currentTimestamp,
      });

      expect(result.deadline).toBe(currentTimestamp + DEFAULT_EXECUTION_DEADLINE_SECONDS);
      expect(result.deadline).toBe(currentTimestamp + 60n);

      const decoded = decodeUniversalRouterSwapCalldata(result.data);
      expect(decoded.deadline).toBe(currentTimestamp + 60n);
    });
  });

  // 2. Decode Round-Trip
  describe('2. Decode Round-Trip', () => {
    it('round-trips poolKey, amountIn, amountOutMinimum, and recipient settlements exactly', () => {
      const amountIn = 1_000_000_000_000n;
      const amountOutMinimum = 2_244n;
      const deadline = 1800000060n;

      const built = buildUniversalRouterSwapCalldata({
        amountIn,
        amountOutMinimum,
        deadline,
      });

      const decoded = decodeUniversalRouterSwapCalldata(built.data);

      expect(decoded.poolKey).toEqual(PINNED_V4_POOL_KEY);
      expect(decoded.amountIn).toBe(amountIn);
      expect(decoded.amountOutMinimum).toBe(amountOutMinimum);
      expect(decoded.deadline).toBe(deadline);
      expect(decoded.zeroForOne).toBe(true);
      expect(decoded.hookData).toBe('0x');
      expect(decoded.settleMaxAmount).toBe(amountIn);
      expect(decoded.takeMinAmount).toBe(amountOutMinimum);
    });
  });

  // 3. Security Rejections (Wrong pool, fee, hooks, or chain)
  describe('3. Security Rejections', () => {
    it('rejects unsupported chain IDs (only 46630 is permitted)', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
          chainId: 4663, // Robinhood Mainnet
        })
      ).toThrow(RobexAppError);

      try {
        buildUniversalRouterSwapCalldata({
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
          chainId: 1, // Ethereum Mainnet
        });
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('CHAIN_ERROR');
      }
    });

    it('rejects poolKey with modified currency0', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
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
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
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
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            feePips: 500,
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects poolKey with modified tickSpacing (e.g. 10 instead of pinned 60)', () => {
      try {
        buildUniversalRouterSwapCalldata({
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            tickSpacing: 10,
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects poolKey with non-zero custom hooks', () => {
      try {
        buildUniversalRouterSwapCalldata({
          amountIn: 500000000000n,
          amountOutMinimum: 1122n,
          poolKey: {
            ...PINNED_V4_POOL_KEY,
            hooks: '0x089dfb78d67963d5461c9a009529b6d8c9c76880', // Custom hook from Plan 004 §5.1 pool 2
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects invalid or zero amountIn', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          amountIn: 0n,
          amountOutMinimum: 1122n,
        })
      ).toThrow(RobexAppError);

      expect(() =>
        buildUniversalRouterSwapCalldata({
          amountIn: -100n,
          amountOutMinimum: 1122n,
        })
      ).toThrow(RobexAppError);
    });

    it('rejects missing amountOut and amountOutMinimum', () => {
      expect(() =>
        buildUniversalRouterSwapCalldata({
          amountIn: 500000000000n,
        })
      ).toThrow(RobexAppError);
    });
  });

  // 4. Pre-send Checks & Simulation Revert Decoding
  describe('4. Pre-Send Simulation & Revert Decoding', () => {
    it('decodes V4TooLittleReceived error on simulation revert and fails closed', async () => {
      // Revert data from plans/004 §4.3 Trường hợp B (minOut = 1123, actualOut = 1122)
      // Selector 0x8b063d73: V4TooLittleReceived(1123, 1122)
      const revertData =
        '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462';

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_call') {
          // Simulate node rejecting with revert data
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
          amountIn: 500000000000n,
          calldata: '0x3593564c',
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have thrown RobexAppError');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('QUOTE_ERROR');
        expect(appErr.message).toContain('V4TooLittleReceived');
        expect(appErr.message).toContain('1122');
        expect(appErr.message).toContain('1123');
        expect(appErr.details?.revert).toMatchObject({
          errorName: 'V4TooLittleReceived',
          args: {
            minAmountOut: '1123',
            amountOut: '1122',
          },
        });
      }
    });

    it('decodes V4TooLittleReceived when RPC returns error object without throwing', async () => {
      const revertData =
        '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462';

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_call') {
          return {
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: 3,
              message: 'execution reverted',
              data: revertData,
            },
          };
        }
        throw new Error('Unexpected RPC call');
      };

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: 500000000000n,
          calldata: '0x3593564c',
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have thrown RobexAppError');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('QUOTE_ERROR');
        expect(appErr.details?.revert).toMatchObject({
          errorName: 'V4TooLittleReceived',
        });
      }
    });

    it('decodes standard Error(string) revert message', () => {
      // abi.encodeWithSignature("Error(string)", "Pool is empty")
      // selector 0x08c379a0
      const revertData =
        '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d506f6f6c20697320656d70747900000000000000000000000000000000000000';

      const decoded = decodeRevertReason(revertData);
      expect(decoded.errorName).toBe('Error');
      expect(decoded.message).toContain('Pool is empty');
    });

    it('extracts hex revert data from nested error structures', () => {
      const nested = {
        cause: {
          data: '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462',
        },
      };
      expect(extractRevertData(nested)).toBe(
        '0x8b063d7300000000000000000000000000000000000000000000000000000000000004630000000000000000000000000000000000000000000000000000000000000462'
      );
    });
  });

  // 5. Balance & Gas Check (Decision D3)
  describe('5. Gas Estimation & Balance Requirements (Decision D3)', () => {
    it('requires ETH balance >= amountIn + 2 x estimated gas fee and fails closed when insufficient', async () => {
      const amountIn = 100_000_000_000_000n; // 0.0001 ETH
      const estimatedGas = 132_000n;
      const gasPrice = 10_000_000n; // 10 Mwei (0.01 gwei)
      const estimatedGasFee = estimatedGas * gasPrice; // 1,320,000,000,000 wei
      const requiredEth = amountIn + 2n * estimatedGasFee; // 100,000,000,000,000 + 2,640,000,000,000 = 102,640,000,000,000 wei

      // User has enough for amountIn, but not enough for amountIn + 2x gas fee buffer
      const insufficientBalance = 101_000_000_000_000n;

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0'; // 132,000 gas
        if (method === 'eth_gasPrice') return '0x989680'; // 10,000,000 wei
        if (method === 'eth_getBalance') return `0x${insufficientBalance.toString(16)}`;
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn,
          calldata: '0x3593564c',
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have thrown RobexAppError for insufficient balance');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        const appErr = err as RobexAppError;
        expect(appErr.code).toBe('USER_ERROR');
        expect(appErr.message).toContain('Insufficient ETH balance');
        expect(appErr.details).toMatchObject({
          userBalance: insufficientBalance.toString(),
          requiredEth: requiredEth.toString(),
          amountIn: amountIn.toString(),
          estimatedGas: estimatedGas.toString(),
          gasPrice: gasPrice.toString(),
          estimatedGasFee: estimatedGasFee.toString(),
          bufferMultiplier: 2,
        });
      }
    });

    it('succeeds when ETH balance satisfies amountIn + 2 x estimated gas fee', async () => {
      const amountIn = 100_000_000_000_000n; // 0.0001 ETH
      const estimatedGas = 132_000n;
      const gasPrice = 10_000_000n;
      const estimatedGasFee = estimatedGas * gasPrice;
      const requiredEth = amountIn + 2n * estimatedGasFee; // 102,640,000,000,000 wei

      const sufficientBalance = 200_000_000_000_000n;

      const mockRpcCall = async (method: string) => {
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0'; // 132,000 gas
        if (method === 'eth_gasPrice') return '0x989680'; // 10,000,000 wei
        if (method === 'eth_getBalance') return `0x${sufficientBalance.toString(16)}`;
        throw new Error('Unexpected RPC call: ' + method);
      };

      const result = await runPreSendChecks({
        userAddress: TEST_USER,
        amountIn,
        calldata: '0x3593564c',
        rpcCall: mockRpcCall,
      });

      expect(result.simulated).toBe(true);
      expect(result.estimatedGas).toBe(estimatedGas);
      expect(result.gasPrice).toBe(gasPrice);
      expect(result.estimatedGasFee).toBe(estimatedGasFee);
      expect(result.requiredEth).toBe(requiredEth);
      expect(result.userBalance).toBe(sufficientBalance);
    });

    it('fails closed when eth_estimateGas fails', async () => {
      const mockRpcCall = async (method: string) => {
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') {
          throw new Error('Gas estimation network timeout');
        }
        throw new Error('Unexpected RPC call: ' + method);
      };

      try {
        await runPreSendChecks({
          userAddress: TEST_USER,
          amountIn: 500000000000n,
          calldata: '0x3593564c',
          rpcCall: mockRpcCall,
        });
        expect.unreachable('Should have thrown RobexAppError');
      } catch (err) {
        expect(err).toBeInstanceOf(RobexAppError);
        expect((err as RobexAppError).code).toBe('PROVIDER_ERROR');
      }
    });
  });
});
