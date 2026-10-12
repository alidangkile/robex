import { decodeErrorResult, toHex, type Hex } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { RobexAppError } from '../errors/index.js';
import { EXECUTION_REVERT_ERRORS_ABI } from './abi.js';
import type {
  DecodedRevertReason,
  PreSendCheckParams,
  PreSendCheckResult,
} from './types.js';

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Extracts raw hex revert data from varied RPC error representations.
 */
export function extractRevertData(errOrRes: unknown): string | null {
  if (!errOrRes) return null;
  if (typeof errOrRes === 'string') {
    const match = errOrRes.match(/0x[0-9a-fA-F]{8,}/);
    return match ? match[0] : null;
  }
  if (typeof errOrRes === 'object') {
    const obj = errOrRes as Record<string, unknown>;
    if (typeof obj.data === 'string' && obj.data.startsWith('0x')) {
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
    if (typeof obj.message === 'string') {
      const match = obj.message.match(/0x[0-9a-fA-F]{8,}/);
      if (match) return match[0];
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
 * 1. Simulates swap execution via eth_call from user to universalRouter with msg.value = amountIn.
 *    On revert, fails closed and decodes the error reason (at least V4TooLittleReceived).
 * 2. Estimates transaction gas limit via eth_estimateGas.
 * 3. Requires ETH balance >= amountIn + 2 x estimated gas fee per Decision D3.
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

  const routerAddress = (
    params.routerAddress ?? UNISWAP_V4_TESTNET_QUOTE.universalRouter
  ) as `0x${string}`;

  const calldataHex = (
    params.calldata.startsWith('0x') ? params.calldata : `0x${params.calldata}`
  ) as Hex;

  const valueHex = toHex(params.amountIn);

  // 2. Simulate with eth_call
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
      const decoded = decodeRevertReason(revertData);
      throw new RobexAppError('QUOTE_ERROR', decoded.message, {
        revert: decoded,
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
      const decoded = decodeRevertReason(revertData);
      throw new RobexAppError('QUOTE_ERROR', decoded.message, {
        revert: decoded,
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

  // 3. Estimate Gas with eth_estimateGas
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
      const decoded = decodeRevertReason(revertData);
      throw new RobexAppError('QUOTE_ERROR', `Gas estimation reverted: ${decoded.message}`, {
        revert: decoded,
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

  // 4. Gas Price & Balance Check (Decision D3)
  let gasPrice: bigint;
  if (params.gasPrice !== undefined) {
    gasPrice = params.gasPrice;
  } else {
    const gpRaw = await params.rpcCall('eth_gasPrice', []);
    gasPrice = parseBigIntValue(gpRaw, 'gasPrice');
  }

  const estimatedGasFee = estimatedGas * gasPrice;
  // Decision D3: Balance must be >= amountIn + 2 x estimated gas fee
  const requiredEth = params.amountIn + 2n * estimatedGasFee;

  let userBalance: bigint;
  if (params.userBalance !== undefined) {
    userBalance = params.userBalance;
  } else {
    const balRaw = await params.rpcCall('eth_getBalance', [params.userAddress, 'latest']);
    userBalance = parseBigIntValue(balRaw, 'userBalance');
  }

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
