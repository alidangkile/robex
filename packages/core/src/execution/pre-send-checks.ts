import { decodeErrorResult, toHex, type Hex } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { RobexAppError } from '../errors/index.js';
import {
  EXECUTION_REVERT_ERRORS_ABI,
  COMMANDS,
  ACTIONS_ETH_TO_USDG_HEX,
} from './abi.js';
import {
  assertPinnedPoolKey,
  decodeUniversalRouterSwapCalldata,
} from './build-swap-calldata.js';
import type {
  DecodedRevertReason,
  DecodedSwapCalldata,
  PreSendCheckParams,
  PreSendCheckResult,
} from './types.js';

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Extracts raw hex revert data strictly from structured fields (data/error/cause).
 * Does NOT extract via regex from message text (E-09).
 */
export function extractRevertData(errOrRes: unknown): string | null {
  if (!errOrRes) return null;
  if (typeof errOrRes === 'string') {
    if (errOrRes.startsWith('0x') && errOrRes.length >= 10 && /^0x[0-9a-fA-F]+$/.test(errOrRes)) {
      return errOrRes;
    }
    return null;
  }
  if (typeof errOrRes === 'object') {
    const obj = errOrRes as Record<string, unknown>;
    if (typeof obj.data === 'string' && obj.data.startsWith('0x') && obj.data.length >= 10) {
      return obj.data;
    }
    if (obj.error && typeof obj.error === 'object') {
      const nested = extractRevertData(obj.error);
      if (nested) return nested;
    }
    if (obj.cause && typeof obj.cause === 'object') {
      const nested = extractRevertData(obj.cause);
      if (nested) return nested;
    }
    if (obj.response && typeof obj.response === 'object') {
      const nested = extractRevertData(obj.response);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Decodes revert data against known Uniswap v4 and Universal Router error ABIs.
 * Decodes at least V4TooLittleReceived(uint256 minAmountOut, uint256 amountOut).
 */
export function decodeRevertReason(revertData: string): DecodedRevertReason {
  const hex = (revertData.startsWith('0x') ? revertData : `0x${revertData}`) as Hex;

  try {
    const decoded = decodeErrorResult({
      abi: EXECUTION_REVERT_ERRORS_ABI,
      data: hex,
    });

    if (decoded.errorName === 'V4TooLittleReceived') {
      const [minAmountOut, amountOut] = decoded.args as [bigint, bigint];
      return {
        errorName: 'V4TooLittleReceived',
        args: { minAmountOut: minAmountOut.toString(), amountOut: amountOut.toString() },
        message: `Swap simulation reverted: output ${amountOut} is below minimum required ${minAmountOut} (V4TooLittleReceived)`,
        rawData: hex,
      };
    }

    if (decoded.errorName === 'ExecutionFailed') {
      const [commandIndex, message] = decoded.args as [bigint, Hex];
      // Recursively decode inner revert if message is an error
      let innerMessage = message;
      if (typeof message === 'string' && message.startsWith('0x') && message.length >= 10) {
        const inner = decodeRevertReason(message);
        innerMessage = inner.message as Hex;
      }
      return {
        errorName: 'ExecutionFailed',
        args: { commandIndex: commandIndex.toString(), message },
        message: `Universal Router execution failed at command index ${commandIndex}: ${innerMessage}`,
        rawData: hex,
      };
    }

    if (decoded.errorName === 'TransactionDeadlinePassed') {
      const [deadline] = decoded.args as [bigint];
      return {
        errorName: 'TransactionDeadlinePassed',
        args: { deadline: deadline.toString() },
        message: `Transaction deadline passed (${deadline})`,
        rawData: hex,
      };
    }

    if (decoded.errorName === 'Error') {
      const [message] = decoded.args as [string];
      return {
        errorName: 'Error',
        args: { message },
        message: `Execution reverted: ${message}`,
        rawData: hex,
      };
    }

    if (decoded.errorName === 'Panic') {
      const [code] = decoded.args as [bigint];
      return {
        errorName: 'Panic',
        args: { code: code.toString() },
        message: `Execution panicked with code ${code}`,
        rawData: hex,
      };
    }
  } catch {
    // Unrecognized custom error selector
  }

  return {
    errorName: 'UnknownRevert',
    message: `Execution reverted with data: ${hex}`,
    rawData: hex,
  };
}

function parseBigIntValue(value: unknown, fieldName: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    if (value.startsWith('0x')) return BigInt(value);
    return BigInt(value);
  }
  if (value && typeof value === 'object' && 'result' in value) {
    return parseBigIntValue((value as { result: unknown }).result, fieldName);
  }
  throw new RobexAppError('PROVIDER_ERROR', `Failed to parse ${fieldName} from RPC return`, {
    raw: value,
  });
}

/**
 * Pre-send checks in core before submitting a swap transaction:
 * 1. Checks eth_chainId first and strictly enforces testnet 46630 (E-02, E-04).
 * 2. Decodes calldata and re-verifies pool key, zeroForOne, amountIn, settleMaxAmount,
 *    and takeMinAmount == amountOutMinimum; fails closed on any mismatch (E-04).
 * 3. Enforces user ETH balance >= amountIn before attempting simulation (E-05).
 * 4. Simulates swap execution via eth_call from user to universalRouter with msg.value = amountIn.
 *    On revert, fails closed and decodes structured error data (E-09).
 * 5. Estimates transaction gas limit via eth_estimateGas.
 * 6. Requires ETH balance >= amountIn + 2 x estimated gas fee per Decision D3 (E-05).
 *
 * RPC calls are injected as a function to allow complete mock verification in unit tests.
 */
export async function runPreSendChecks(params: PreSendCheckParams): Promise<PreSendCheckResult> {
  // 1. Validate inputs
  if (!EVM_ADDRESS_REGEX.test(params.userAddress)) {
    throw new RobexAppError('USER_ERROR', 'Invalid user address format', {
      userAddress: params.userAddress,
    });
  }
  if (params.amountIn <= 0n) {
    throw new RobexAppError('USER_ERROR', 'amountIn must be positive', {
      amountIn: params.amountIn.toString(),
    });
  }

  // Target Router Address is always the pinned testnet universalRouter (E-01)
  const routerAddress = UNISWAP_V4_TESTNET_QUOTE.universalRouter as `0x${string}`;

  const calldataHex = (
    params.calldata.startsWith('0x') ? params.calldata : `0x${params.calldata}`
  ) as Hex;

  const valueHex = toHex(params.amountIn);

  // 2. Call eth_chainId first and strictly enforce 46630 (E-02, E-04)
  let chainIdRaw: unknown;
  try {
    chainIdRaw = await params.rpcCall('eth_chainId', []);
  } catch (err: unknown) {
    throw new RobexAppError(
      'CHAIN_ERROR',
      `Failed to verify chain ID from RPC: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  let chainId: bigint;
  try {
    chainId = parseBigIntValue(chainIdRaw, 'chainId');
  } catch (err: unknown) {
    throw new RobexAppError('CHAIN_ERROR', 'Invalid chain ID returned from RPC', { raw: chainIdRaw, error: err });
  }

  if (chainId !== BigInt(UNISWAP_V4_TESTNET_QUOTE.chainId)) {
    throw new RobexAppError(
      'CHAIN_ERROR',
      `Pre-send checks failed: connected chain ${chainId} does not match required chain ${UNISWAP_V4_TESTNET_QUOTE.chainId}`,
      { chainId: chainId.toString(), expected: UNISWAP_V4_TESTNET_QUOTE.chainId }
    );
  }

  // 3. Decode calldata and re-verify policy constraints (E-04)
  let decoded: DecodedSwapCalldata;
  try {
    decoded = decodeUniversalRouterSwapCalldata(calldataHex);
  } catch (err: unknown) {
    throw new RobexAppError(
      'SECURITY_ERROR',
      `Calldata verification failed: unable to decode Universal Router calldata: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  if (decoded.commands.toLowerCase() !== COMMANDS.V4_SWAP.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata commands must be V4_SWAP (0x10)', {
      commands: decoded.commands,
    });
  }

  if (decoded.actions.toLowerCase() !== ACTIONS_ETH_TO_USDG_HEX.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata actions must be 0x060c0f (SWAP, SETTLE, TAKE)', {
      actions: decoded.actions,
    });
  }

  // Re-verify pool key against pinned policy
  assertPinnedPoolKey(decoded.poolKey);

  if (!decoded.zeroForOne) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata swap direction must be zeroForOne (native ETH to USDG)', {
      zeroForOne: decoded.zeroForOne,
    });
  }

  if (decoded.amountIn !== params.amountIn) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata amountIn does not match params.amountIn', {
      calldataAmountIn: decoded.amountIn.toString(),
      paramsAmountIn: params.amountIn.toString(),
    });
  }

  if (decoded.settleMaxAmount !== params.amountIn) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata settleMaxAmount does not match amountIn / value', {
      settleMaxAmount: decoded.settleMaxAmount.toString(),
      amountIn: params.amountIn.toString(),
    });
  }

  if (decoded.takeMinAmount !== decoded.amountOutMinimum) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata takeMinAmount does not match amountOutMinimum', {
      takeMinAmount: decoded.takeMinAmount.toString(),
      amountOutMinimum: decoded.amountOutMinimum.toString(),
    });
  }

  if (decoded.settleCurrency.toLowerCase() !== UNISWAP_V4_TESTNET_QUOTE.nativeEth.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata settleCurrency must match pinned native ETH', {
      settleCurrency: decoded.settleCurrency,
    });
  }

  if (decoded.takeCurrency.toLowerCase() !== UNISWAP_V4_TESTNET_QUOTE.usdg.toLowerCase()) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata takeCurrency must match pinned USDG', {
      takeCurrency: decoded.takeCurrency,
    });
  }

  // 4. Enforce user ETH balance >= amountIn before attempting simulation (E-05)
  let userBalance: bigint;
  if (params.userBalance !== undefined) {
    userBalance = params.userBalance;
  } else {
    let balRaw: unknown;
    try {
      balRaw = await params.rpcCall('eth_getBalance', [params.userAddress, 'latest']);
    } catch (err: unknown) {
      throw new RobexAppError(
        'PROVIDER_ERROR',
        `Failed to fetch user ETH balance: ${err instanceof Error ? err.message : String(err)}`,
        { error: err }
      );
    }
    userBalance = parseBigIntValue(balRaw, 'userBalance');
  }

  if (userBalance < params.amountIn) {
    throw new RobexAppError(
      'USER_ERROR',
      `Insufficient ETH balance for swap amount. Required: ${params.amountIn} wei, Available: ${userBalance} wei`,
      {
        userBalance: userBalance.toString(),
        amountIn: params.amountIn.toString(),
      }
    );
  }

  // 5. Simulate with eth_call
  let simResult: unknown;
  try {
    simResult = await params.rpcCall('eth_call', [
      {
        from: params.userAddress,
        to: routerAddress,
        value: valueHex,
        data: calldataHex,
      },
      'latest',
    ]);
  } catch (err: unknown) {
    const revertData = extractRevertData(err);
    if (revertData) {
      const decodedRevert = decodeRevertReason(revertData);
      throw new RobexAppError('QUOTE_ERROR', decodedRevert.message, {
        revert: decodedRevert,
        rawData: revertData,
      });
    }
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Simulation failed: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  // Handle RPC responses returning error objects instead of throwing
  if (simResult && typeof simResult === 'object' && 'error' in simResult) {
    const revertData = extractRevertData(simResult);
    if (revertData) {
      const decodedRevert = decodeRevertReason(revertData);
      throw new RobexAppError('QUOTE_ERROR', decodedRevert.message, {
        revert: decodedRevert,
        rawData: revertData,
      });
    }
    const errObj = (simResult as { error: { message?: string } }).error;
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Simulation returned error: ${errObj.message ?? 'unknown'}`,
      { error: errObj }
    );
  }

  // 6. Estimate Gas with eth_estimateGas
  let estGasRaw: unknown;
  try {
    estGasRaw = await params.rpcCall('eth_estimateGas', [
      {
        from: params.userAddress,
        to: routerAddress,
        value: valueHex,
        data: calldataHex,
      },
    ]);
  } catch (err: unknown) {
    const revertData = extractRevertData(err);
    if (revertData) {
      const decodedRevert = decodeRevertReason(revertData);
      throw new RobexAppError('QUOTE_ERROR', `Gas estimation reverted: ${decodedRevert.message}`, {
        revert: decodedRevert,
        rawData: revertData,
      });
    }
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Gas estimation failed: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  const estimatedGas = parseBigIntValue(estGasRaw, 'estimatedGas');

  // 7. Gas Price & 2x Gas Buffer Balance Check (Decision D3, E-05)
  let gasPrice: bigint;
  if (params.gasPrice !== undefined) {
    gasPrice = params.gasPrice;
  } else {
    let gpRaw: unknown;
    try {
      gpRaw = await params.rpcCall('eth_gasPrice', []);
    } catch (err: unknown) {
      throw new RobexAppError(
        'PROVIDER_ERROR',
        `Failed to fetch gas price: ${err instanceof Error ? err.message : String(err)}`,
        { error: err }
      );
    }
    gasPrice = parseBigIntValue(gpRaw, 'gasPrice');
  }

  const estimatedGasFee = estimatedGas * gasPrice;
  // Decision D3: Balance must be >= amountIn + 2 x estimated gas fee
  const requiredEth = params.amountIn + 2n * estimatedGasFee;

  if (userBalance < requiredEth) {
    throw new RobexAppError(
      'USER_ERROR',
      `Insufficient ETH balance for swap and gas buffer. Required: ${requiredEth} wei, Available: ${userBalance} wei`,
      {
        userBalance: userBalance.toString(),
        requiredEth: requiredEth.toString(),
        amountIn: params.amountIn.toString(),
        estimatedGas: estimatedGas.toString(),
        gasPrice: gasPrice.toString(),
        estimatedGasFee: estimatedGasFee.toString(),
        bufferMultiplier: 2,
      }
    );
  }

  return {
    simulated: true,
    estimatedGas,
    gasPrice,
    estimatedGasFee,
    requiredEth,
    userBalance,
  };
}
