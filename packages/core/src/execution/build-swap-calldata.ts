import {
  encodeAbiParameters,
  encodeFunctionData,
  decodeAbiParameters,
  decodeFunctionData,
  type Hex,
} from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { RobexAppError } from '../errors/index.js';
import { minimumAmountOut, resolveSlippageBps } from '../quote/v4-math.js';
import {
  COMMANDS,
  ACTIONS_ETH_TO_USDG_HEX,
  UNIVERSAL_ROUTER_EXECUTE_ABI,
  V4_SWAP_INPUT_ABI_PARAMS,
  EXACT_INPUT_SINGLE_ABI_PARAMS,
  SETTLE_ALL_ABI_PARAMS,
  TAKE_ALL_ABI_PARAMS,
} from './abi.js';
import type {
  BuildSwapCalldataParams,
  BuildSwapCalldataResult,
  DecodedSwapCalldata,
  V4PoolKey,
} from './types.js';

/**
 * Decision D1: Default execution deadline is 60 seconds from call time.
 */
export const DEFAULT_EXECUTION_DEADLINE_SECONDS = 60n;

/**
 * Pinned pool key reference from Stage 003B / UNISWAP_V4_TESTNET_QUOTE.
 */
export const PINNED_V4_POOL_KEY: V4PoolKey = {
  currency0: UNISWAP_V4_TESTNET_QUOTE.nativeEth,
  currency1: UNISWAP_V4_TESTNET_QUOTE.usdg,
  feePips: UNISWAP_V4_TESTNET_QUOTE.feePips,
  tickSpacing: UNISWAP_V4_TESTNET_QUOTE.tickSpacing,
  hooks: UNISWAP_V4_TESTNET_QUOTE.hooks,
};

const UINT128_MAX = (1n << 128n) - 1n;

/**
 * Validates that the provided pool key strictly matches the 003B pinned pool.
 * Throws RobexAppError with SECURITY_ERROR if any parameter differs.
 */
export function assertPinnedPoolKey(poolKey: V4PoolKey): void {
  if (poolKey.currency0.toLowerCase() !== PINNED_V4_POOL_KEY.currency0.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Pool currency0 must match pinned native ETH', {
      expected: PINNED_V4_POOL_KEY.currency0,
      actual: poolKey.currency0,
    });
  }
  if (poolKey.currency1.toLowerCase() !== PINNED_V4_POOL_KEY.currency1.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Pool currency1 must match pinned USDG', {
      expected: PINNED_V4_POOL_KEY.currency1,
      actual: poolKey.currency1,
    });
  }
  if (poolKey.feePips !== PINNED_V4_POOL_KEY.feePips) {
    throw new RobexAppError('SECURITY_ERROR', 'Pool fee must match pinned 3000 fee pips (0.3%)', {
      expected: PINNED_V4_POOL_KEY.feePips,
      actual: poolKey.feePips,
    });
  }
  if (poolKey.tickSpacing !== PINNED_V4_POOL_KEY.tickSpacing) {
    throw new RobexAppError('SECURITY_ERROR', 'Pool tickSpacing must match pinned 60', {
      expected: PINNED_V4_POOL_KEY.tickSpacing,
      actual: poolKey.tickSpacing,
    });
  }
  if (poolKey.hooks.toLowerCase() !== PINNED_V4_POOL_KEY.hooks.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Pool hooks must match pinned address(0) unhooked pool', {
      expected: PINNED_V4_POOL_KEY.hooks,
      actual: poolKey.hooks,
    });
  }
}

/**
 * Builds Universal Router execute(commands, inputs, deadline) calldata for native ETH -> USDG
 * on the pinned Uniswap v4 pool.
 *
 * Actions sequence:
 * 1. SWAP_EXACT_IN_SINGLE (0x06): native ETH -> USDG on pinned pool.
 * 2. SETTLE_ALL (0x0c): settle native ETH from msg.value to PoolManager.
 * 3. TAKE_ALL (0x0f): take USDG output from PoolManager to user.
 *
 * Citations:
 * - Universal Router Commands: Commands.V4_SWAP = 0x10 (plans/004 §4.1)
 * - Uniswap v4 Actions: Actions.SWAP_EXACT_IN_SINGLE = 0x06, SETTLE_ALL = 0x0c, TAKE_ALL = 0x0f (plans/004 §4.1)
 * - ExactInputSingleParams layout: IV4Router.sol / plans/004 §4.1
 */
export function buildUniversalRouterSwapCalldata(
  params: BuildSwapCalldataParams
): BuildSwapCalldataResult {
  // Validate Chain ID: required and must strictly equal testnet 46630 (E-02)
  if (!params.chainId || params.chainId !== UNISWAP_V4_TESTNET_QUOTE.chainId) {
    throw new RobexAppError(
      'CHAIN_ERROR',
      `Universal Router swap execution is only permitted on chain ${UNISWAP_V4_TESTNET_QUOTE.chainId}`,
      { chainId: params.chainId }
    );
  }

  // Validate amountIn
  if (params.amountIn <= 0n) {
    throw new RobexAppError('USER_ERROR', 'amountIn must be positive', {
      amountIn: params.amountIn.toString(),
    });
  }
  if (params.amountIn > UINT128_MAX) {
    throw new RobexAppError('USER_ERROR', 'amountIn exceeds uint128 maximum', {
      amountIn: params.amountIn.toString(),
    });
  }

  // Validate Pool Key against 003B pinned pool policy
  const poolKey = params.poolKey ?? PINNED_V4_POOL_KEY;
  assertPinnedPoolKey(poolKey);

  // Derive amountOutMinimum strictly from quote amountOut and slippage policy (E-03)
  if (params.amountOut === undefined || params.amountOut <= 0n) {
    throw new RobexAppError('USER_ERROR', 'amountOut must be positive', {
      amountOut: params.amountOut?.toString(),
    });
  }
  if (params.amountOut > UINT128_MAX) {
    throw new RobexAppError('USER_ERROR', 'amountOut exceeds uint128 maximum', {
      amountOut: params.amountOut.toString(),
    });
  }

  const slippageBps = resolveSlippageBps(params.slippage ?? {});
  const amountOutMinimum = minimumAmountOut(params.amountOut, slippageBps);
  if (amountOutMinimum <= 0n) {
    throw new RobexAppError('QUOTE_ERROR', 'Calculated amountOutMinimum must be positive', {
      amountOut: params.amountOut.toString(),
      slippageBps: slippageBps.toString(),
    });
  }
  if (amountOutMinimum > UINT128_MAX) {
    throw new RobexAppError('USER_ERROR', 'amountOutMinimum exceeds uint128 maximum', {
      amountOutMinimum: amountOutMinimum.toString(),
    });
  }

  // Calculate deadline: Decision D1 specifies 60s; reject override <= now or > now + 60s (E-03)
  const nowSeconds = params.currentTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
  let deadline: bigint;
  if (params.deadline !== undefined) {
    if (params.deadline <= nowSeconds || params.deadline > nowSeconds + DEFAULT_EXECUTION_DEADLINE_SECONDS) {
      throw new RobexAppError(
        'USER_ERROR',
        `Deadline override must be greater than current timestamp and at most ${DEFAULT_EXECUTION_DEADLINE_SECONDS}s in the future`,
        {
          deadline: params.deadline.toString(),
          now: nowSeconds.toString(),
          maxDeadline: (nowSeconds + DEFAULT_EXECUTION_DEADLINE_SECONDS).toString(),
        }
      );
    }
    deadline = params.deadline;
  } else {
    deadline = nowSeconds + DEFAULT_EXECUTION_DEADLINE_SECONDS;
  }

  // Target Router Address is always the pinned testnet universalRouter (E-01)
  const routerAddress = UNISWAP_V4_TESTNET_QUOTE.universalRouter as `0x${string}`;

  // 1. Encode Action 0x06: SWAP_EXACT_IN_SINGLE
  // ExactInputSingleParams: ((poolKey), zeroForOne, amountIn, amountOutMinimum, hookData)
  const param0 = encodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, [
    {
      poolKey: {
        currency0: poolKey.currency0 as `0x${string}`,
        currency1: poolKey.currency1 as `0x${string}`,
        fee: poolKey.feePips,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks as `0x${string}`,
      },
      zeroForOne: true,
      amountIn: params.amountIn,
      amountOutMinimum,
      hookData: '0x',
    },
  ]);

  // 2. Encode Action 0x0c: SETTLE_ALL
  // SETTLE_ALL: (address currency, uint256 maxAmount)
  const param1 = encodeAbiParameters(SETTLE_ALL_ABI_PARAMS, [
    {
      currency: poolKey.currency0 as `0x${string}`,
      maxAmount: params.amountIn,
    },
  ]);

  // 3. Encode Action 0x0f: TAKE_ALL
  // TAKE_ALL: (address currency, uint256 minAmount)
  const param2 = encodeAbiParameters(TAKE_ALL_ABI_PARAMS, [
    {
      currency: poolKey.currency1 as `0x${string}`,
      minAmount: amountOutMinimum,
    },
  ]);

  // 4. Encode V4_SWAP input tuple: (bytes actions, bytes[] params)
  const input0 = encodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, [
    ACTIONS_ETH_TO_USDG_HEX,
    [param0, param1, param2],
  ]);

  // 5. Encode Universal Router execute(bytes commands, bytes[] inputs, uint256 deadline)
  const data = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
    functionName: 'execute',
    args: [COMMANDS.V4_SWAP, [input0], deadline],
  });

  return {
    to: routerAddress,
    value: params.amountIn,
    data,
    amountIn: params.amountIn,
    amountOutMinimum,
    deadline,
    poolKey,
  };
}

/**
 * Decodes Universal Router execute calldata to reconstruct the swap parameters.
 */
export function decodeUniversalRouterSwapCalldata(calldata: Hex | string): DecodedSwapCalldata {
  const hexData = (calldata.startsWith('0x') ? calldata : `0x${calldata}`) as Hex;

  const decodedFn = decodeFunctionData({
    abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
    data: hexData,
  });

  if (decodedFn.functionName !== 'execute') {
    throw new RobexAppError('USER_ERROR', 'Calldata is not Universal Router execute');
  }

  const [commands, inputs, deadline] = decodedFn.args;
  if (inputs.length !== 1) {
    throw new RobexAppError('USER_ERROR', `Expected 1 input in execute call, got ${inputs.length}`);
  }

  const [actions, params] = decodeAbiParameters(V4_SWAP_INPUT_ABI_PARAMS, inputs[0]);
  if (params.length !== 3) {
    throw new RobexAppError('USER_ERROR', `Expected 3 action params, got ${params.length}`);
  }

  // Decode param0 (SWAP_EXACT_IN_SINGLE)
  const [exactInputSingle] = decodeAbiParameters(EXACT_INPUT_SINGLE_ABI_PARAMS, params[0]);

  // Decode param1 (SETTLE_ALL)
  const [settleAll] = decodeAbiParameters(SETTLE_ALL_ABI_PARAMS, params[1]);

  // Decode param2 (TAKE_ALL)
  const [takeAll] = decodeAbiParameters(TAKE_ALL_ABI_PARAMS, params[2]);

  return {
    commands,
    actions,
    deadline,
    poolKey: {
      currency0: exactInputSingle.poolKey.currency0,
      currency1: exactInputSingle.poolKey.currency1,
      feePips: exactInputSingle.poolKey.fee,
      tickSpacing: exactInputSingle.poolKey.tickSpacing,
      hooks: exactInputSingle.poolKey.hooks,
    },
    zeroForOne: exactInputSingle.zeroForOne,
    amountIn: exactInputSingle.amountIn,
    amountOutMinimum: exactInputSingle.amountOutMinimum,
    hookData: exactInputSingle.hookData,
    settleCurrency: settleAll.currency,
    settleMaxAmount: settleAll.maxAmount,
    takeCurrency: takeAll.currency,
    takeMinAmount: takeAll.minAmount,
  };
}
