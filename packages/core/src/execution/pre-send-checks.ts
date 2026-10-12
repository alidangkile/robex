import { decodeErrorResult, toHex, type Hex } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { RobexAppError } from '../errors/index.js';
import { ABSOLUTE_ETH_CAP_WEI } from '../quote/v4-math.js';
import { EXECUTION_REVERT_ERRORS_ABI } from './abi.js';
import {
  buildUniversalRouterSwapCalldata,
  decodeUniversalRouterSwapCalldata,
  getExecutionTimestamp,
  DEFAULT_EXECUTION_DEADLINE_SECONDS,
} from './build-swap-calldata.js';
import type {
  BuildSwapCalldataResult,
  DecodedRevertReason,
  DecodedSwapCalldata,
  PreSendCheckParams,
  PreSendCheckResult,
} from './types.js';

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function isValidHexString(str: unknown): str is Hex {
  return (
    typeof str === 'string' &&
    str.startsWith('0x') &&
    str.length >= 10 &&
    /^0x[0-9a-fA-F]+$/.test(str)
  );
}

/**
 * Extracts raw hex revert data strictly from structured fields (data/error/cause).
 * Does NOT extract via regex from message text (E-09, QA-05).
 */
export function extractRevertData(errOrRes: unknown): string | null {
  if (!errOrRes) return null;
  if (typeof errOrRes === 'string') {
    if (isValidHexString(errOrRes)) {
      return errOrRes;
    }
    return null;
  }
  if (typeof errOrRes === 'object') {
    const obj = errOrRes as Record<string, unknown>;
    if (isValidHexString(obj.data)) {
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
  if (!isValidHexString(revertData)) {
    return {
      errorName: 'UnknownRevert',
      message: `Execution reverted with invalid data: ${String(revertData)}`,
      rawData: String(revertData),
    };
  }
  const hex = revertData as Hex;

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
      return {
        errorName: 'TransactionDeadlinePassed',
        args: {},
        message: 'Transaction deadline passed (TransactionDeadlinePassed)',
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

export function parseBigIntValue(value: unknown, fieldName: string): bigint {
  if (value === null || value === undefined) {
    throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC return is null or undefined`, {
      raw: value,
    });
  }

  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC cannot be negative`, {
        raw: value.toString(),
      });
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC must be a non-negative finite integer`, {
        raw: value,
      });
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.includes('-')) {
      throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC cannot be negative`, {
        raw: value,
      });
    }
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      if (!/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
        throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC has invalid hex format`, {
          raw: value,
        });
      }
      try {
        const parsed = BigInt(trimmed);
        if (parsed < 0n) {
          throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC cannot be negative`, { raw: value });
        }
        return parsed;
      } catch (err: unknown) {
        throw new RobexAppError('PROVIDER_ERROR', `Failed to parse ${fieldName} hex from RPC return`, {
          raw: value,
          error: err,
        });
      }
    }
    if (/^[0-9]+$/.test(trimmed)) {
      try {
        const parsed = BigInt(trimmed);
        if (parsed < 0n) {
          throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC cannot be negative`, { raw: value });
        }
        return parsed;
      } catch (err: unknown) {
        throw new RobexAppError('PROVIDER_ERROR', `Failed to parse ${fieldName} decimal from RPC return`, {
          raw: value,
          error: err,
        });
      }
    }
    throw new RobexAppError('PROVIDER_ERROR', `${fieldName} from RPC is not a valid numeric string`, {
      raw: value,
    });
  }

  if (value && typeof value === 'object' && 'result' in value) {
    return parseBigIntValue((value as { result: unknown }).result, fieldName);
  }

  throw new RobexAppError('PROVIDER_ERROR', `Failed to parse ${fieldName} from RPC return`, {
    raw: value,
  });
}

const ALLOWED_PRE_SEND_KEYS = new Set([
  'chainId',
  'userAddress',
  'amountIn',
  'amountOut',
  'slippage',
  'calldata',
  'rpcCall',
]);

/**
 * Pre-send checks in core before submitting a swap transaction:
 * 1. Checks eth_chainId first and strictly enforces testnet 46630 (E-02, E-04).
 * 2. Decodes calldata to extract deadline and verifies now < deadline <= now + 60s (QA-01, QA-02).
 * 3. Builds reference calldata using the exact input parameters and requires that calldata
 *    is byte-for-byte EQUAL to the canonical builder output (QA-02).
 * 4. Enforces user ETH balance >= amountIn before attempting simulation (E-05). Always reads
 *    balance from RPC (QA-03).
 * 5. Simulates swap execution via eth_call from user to universalRouter with msg.value = amountIn.
 *    On revert, fails closed and decodes structured error data (E-09, QA-05).
 * 6. Estimates transaction gas limit via eth_estimateGas.
 * 7. Reads gas price from RPC (QA-03) and requires ETH balance >= amountIn + 2 x gas fee (D3).
 *
 * RPC calls are injected as a function to allow complete mock verification in unit tests.
 */
export async function runPreSendChecks(params: PreSendCheckParams): Promise<PreSendCheckResult> {
  if (!params || typeof params !== 'object') {
    throw new RobexAppError('USER_ERROR', 'Parameters must be an object');
  }

  // Reject unknown parameter keys at runtime (F-R2-02)
  for (const key of Object.keys(params)) {
    if (!ALLOWED_PRE_SEND_KEYS.has(key)) {
      throw new RobexAppError(
        'USER_ERROR',
        `Unknown parameter key "${key}" passed to runPreSendChecks`,
        { key, allowedKeys: Array.from(ALLOWED_PRE_SEND_KEYS) }
      );
    }
  }

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
  if (params.amountIn > ABSOLUTE_ETH_CAP_WEI) {
    throw new RobexAppError(
      'USER_ERROR',
      `amountIn exceeds maximum allowed limit of ${ABSOLUTE_ETH_CAP_WEI} wei (0.0001 ETH per Decision D2)`,
      {
        amountIn: params.amountIn.toString(),
        maxAmountIn: ABSOLUTE_ETH_CAP_WEI.toString(),
      }
    );
  }
  if (params.amountOut <= 0n) {
    throw new RobexAppError('USER_ERROR', 'amountOut must be positive', {
      amountOut: params.amountOut.toString(),
    });
  }
  if (params.chainId !== UNISWAP_V4_TESTNET_QUOTE.chainId) {
    throw new RobexAppError(
      'CHAIN_ERROR',
      `Universal Router swap execution is only permitted on chain ${UNISWAP_V4_TESTNET_QUOTE.chainId}`,
      { chainId: params.chainId }
    );
  }

  // Target Router Address is always the pinned testnet universalRouter (E-01)
  const routerAddress = UNISWAP_V4_TESTNET_QUOTE.universalRouter as `0x${string}`;

  if (!params.calldata || typeof params.calldata !== 'string') {
    throw new RobexAppError('SECURITY_ERROR', 'Invalid or missing calldata');
  }

  const calldataHex = (
    params.calldata.startsWith('0x') ? params.calldata : `0x${params.calldata}`
  ) as Hex;

  if (!/^0x[0-9a-fA-F]+$/.test(calldataHex)) {
    throw new RobexAppError('SECURITY_ERROR', 'Calldata contains invalid non-hex characters');
  }

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

  // 3. Decode calldata and verify deadline separately (QA-01, QA-02)
  let decoded: DecodedSwapCalldata;
  try {
    decoded = decodeUniversalRouterSwapCalldata(calldataHex);
  } catch (err: unknown) {
    if (err instanceof RobexAppError) throw err;
    throw new RobexAppError(
      'SECURITY_ERROR',
      `Calldata verification failed: unable to decode Universal Router calldata: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  const nowSeconds = getExecutionTimestamp();
  if (decoded.deadline <= nowSeconds || decoded.deadline > nowSeconds + DEFAULT_EXECUTION_DEADLINE_SECONDS) {
    throw new RobexAppError(
      'USER_ERROR',
      `Calldata deadline ${decoded.deadline} has expired or exceeds maximum 60s execution window (now: ${nowSeconds})`,
      {
        deadline: decoded.deadline.toString(),
        now: nowSeconds.toString(),
        maxDeadline: (nowSeconds + DEFAULT_EXECUTION_DEADLINE_SECONDS).toString(),
      }
    );
  }

  // 4. Re-build canonical calldata using caller build inputs & require byte-for-byte EQUALITY (QA-02)
  let expectedBuild: BuildSwapCalldataResult;
  try {
    expectedBuild = buildUniversalRouterSwapCalldata({
      chainId: params.chainId,
      amountIn: params.amountIn,
      amountOut: params.amountOut,
      slippage: params.slippage,
      deadline: decoded.deadline,
    });
  } catch (err: unknown) {
    if (err instanceof RobexAppError) throw err;
    throw new RobexAppError(
      'SECURITY_ERROR',
      `Failed to construct reference calldata for verification: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  if (calldataHex.toLowerCase() !== expectedBuild.data.toLowerCase()) {
    throw new RobexAppError(
      'SECURITY_ERROR',
      'Calldata verification failed: calldata is not byte-for-byte equal to canonical Universal Router swap execution layout',
      {
        actualLength: calldataHex.length,
        expectedLength: expectedBuild.data.length,
      }
    );
  }

  // 5. Enforce user ETH balance >= amountIn before attempting simulation (E-05, QA-03)
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
  const userBalance = parseBigIntValue(balRaw, 'userBalance');

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

  // 6. Simulate with eth_call
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

  // 7. Estimate Gas with eth_estimateGas
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

  // 8. Gas Price & 2x Gas Buffer Balance Check (Decision D3, E-05, QA-03)
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
  const gasPrice = parseBigIntValue(gpRaw, 'gasPrice');

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
