import { toHex } from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import type {
  SendSwapTransactionParams,
  SendSwapTransactionResult,
  SwapTransactionState,
} from '@robex/types';
import { RobexAppError } from '../errors/index.js';
import {
  buildUniversalRouterSwapCalldata,
  getExecutionTimestamp,
} from './build-swap-calldata.js';
import {
  parseBigIntValue,
  runPreSendChecks,
} from './pre-send-checks.js';
import {
  pollTransactionReceipt,
  verifyAndParseReceipt,
  type PollReceiptOptions,
} from './receipt-tracker.js';
import {
  recordPendingSwapInternal,
  clearPendingSwapInternal,
} from './pending-guard.js';
import { parseHexQuantity } from '../quote/balance-fill.js';

const ALLOWED_SWAP_SEND_KEYS = new Set([
  'chainId',
  'amountIn',
  'amountOut',
  'slippage',
  'deadline',
  'poolKey',
]);

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export interface GuardedSwapExecutionContext {
  userAddress: string;
  rpcCall: (method: string, params: unknown[]) => Promise<unknown>;
  sendTransaction: (tx: {
    from: string;
    to: string;
    value: string;
    data: string;
    gas: string;
    chainId: string;
  }) => Promise<string>;
  onStateChange?: (state: SwapTransactionState, details?: unknown) => void;
  isSessionActive?: () => boolean;
  pollOptions?: PollReceiptOptions;
}

/**
 * Evaluates whether an error constitutes user wallet rejection (S-07).
 * Strictly requires code 4001, or exact 'User rejected'/'User denied' message variants.
 * Does NOT match generic node rejection messages (e.g. 'transaction rejected: insufficient funds').
 */
export function isUserRejectionError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (obj.code === 4001 || obj.code === '4001') return true;
    if (obj.cause && isUserRejectionError(obj.cause)) return true;
    if (obj.error && isUserRejectionError(obj.error)) return true;
    if (typeof obj.message === 'string') {
      const msg = obj.message.trim().toLowerCase();
      if (
        msg === 'user rejected' ||
        msg === 'user rejected the request' ||
        msg === 'user rejected the request.' ||
        msg === 'user rejected the transaction' ||
        msg === 'user rejected the transaction.' ||
        msg === 'user denied' ||
        msg === 'user denied transaction' ||
        msg === 'user denied transaction signature' ||
        msg === 'user denied transaction signature.' ||
        msg === 'user denied the request' ||
        msg === 'user denied the request.'
      ) {
        return true;
      }
    }
  }
  if (typeof err === 'string') {
    const msg = err.trim().toLowerCase();
    if (
      msg === 'user rejected' ||
      msg === 'user rejected the request' ||
      msg === 'user rejected the request.' ||
      msg === 'user rejected the transaction' ||
      msg === 'user rejected the transaction.' ||
      msg === 'user denied' ||
      msg === 'user denied transaction' ||
      msg === 'user denied transaction signature' ||
      msg === 'user denied transaction signature.' ||
      msg === 'user denied the request' ||
      msg === 'user denied the request.'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Executes a swap transaction through the strict C1 PR 2A guarded sequence:
 * (a) eth_chainId == 46630
 * (b) active account matches from
 * (c) device clock vs block.timestamp latest skew <= +-30s ("kiểm tra đồng hồ thiết bị")
 * (d) build calldata via core
 * (e) runPreSendChecks via wallet RPC
 * (f) eth_sendTransaction with to/value/data strictly from core output and gas = estimatedGas * 120 / 100
 * No nonce, no message signing, no approve.
 * Polls receipt with 180s timeout; confirmed only on status 0x1 and matched to/from.
 */
export async function executeGuardedSwap(
  params: SendSwapTransactionParams,
  context: GuardedSwapExecutionContext
): Promise<SendSwapTransactionResult> {
  // 0. Strict key allowlist validation
  if (!params || typeof params !== 'object') {
    context.onStateChange?.('user_error');
    throw new RobexAppError('USER_ERROR', 'Swap transaction parameters must be an object');
  }

  for (const key of Object.keys(params)) {
    if (!ALLOWED_SWAP_SEND_KEYS.has(key)) {
      context.onStateChange?.('user_error', { key });
      throw new RobexAppError(
        'USER_ERROR',
        `Unknown parameter key "${key}" passed to sendSwapTransaction`,
        { key, allowedKeys: Array.from(ALLOWED_SWAP_SEND_KEYS) }
      );
    }
  }

  if (!context.userAddress || !EVM_ADDRESS_REGEX.test(context.userAddress)) {
    context.onStateChange?.('user_error', { userAddress: context.userAddress });
    throw new RobexAppError('USER_ERROR', 'Invalid user address for swap execution', {
      userAddress: context.userAddress,
    });
  }

  // Session generation check before start
  if (context.isSessionActive && !context.isSessionActive()) {
    context.onStateChange?.('cancelled', {
      error: 'Swap transaction cancelled: wallet session invalidated before execution',
    });
    throw new RobexAppError(
      'SECURITY_ERROR',
      'Swap transaction cancelled: wallet session invalidated before execution'
    );
  }

  // Initial state: ready
  context.onStateChange?.('ready');

  // Step (a): eth_chainId == 46630
  let chainIdRaw: unknown;
  try {
    chainIdRaw = await context.rpcCall('eth_chainId', []);
  } catch (err: unknown) {
    context.onStateChange?.('provider_error', { error: err });
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Failed to verify wallet chain ID: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  let walletChainId: bigint;
  try {
    walletChainId = parseBigIntValue(chainIdRaw, 'chainId');
  } catch (err: unknown) {
    context.onStateChange?.('wrong_network', { raw: chainIdRaw, error: err });
    throw new RobexAppError('CHAIN_ERROR', 'Invalid chain ID returned from wallet', {
      raw: chainIdRaw,
      error: err,
    });
  }

  if (walletChainId !== BigInt(UNISWAP_V4_TESTNET_QUOTE.chainId)) {
    context.onStateChange?.('wrong_network', {
      chainId: walletChainId.toString(),
      expected: UNISWAP_V4_TESTNET_QUOTE.chainId,
    });
    throw new RobexAppError(
      'CHAIN_ERROR',
      `Connected wallet network ${walletChainId} does not match required chain ${UNISWAP_V4_TESTNET_QUOTE.chainId}`,
      { chainId: walletChainId.toString(), expected: UNISWAP_V4_TESTNET_QUOTE.chainId }
    );
  }

  // Step (b): Active account matches from (S-01: fails closed)
  let accountsRaw: unknown;
  try {
    accountsRaw = await context.rpcCall('eth_accounts', []);
  } catch (err: unknown) {
    context.onStateChange?.('provider_error', { error: err });
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Failed to verify active wallet accounts: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  if (!Array.isArray(accountsRaw) || accountsRaw.length === 0) {
    context.onStateChange?.('provider_error', { accountsRaw });
    throw new RobexAppError(
      'PROVIDER_ERROR',
      'No active accounts returned from wallet (eth_accounts is empty or not an array)',
      { accountsRaw }
    );
  }

  const activeAccount = accountsRaw[0];
  if (typeof activeAccount !== 'string' || !EVM_ADDRESS_REGEX.test(activeAccount)) {
    context.onStateChange?.('provider_error', { activeAccount });
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Active account returned from wallet is not a valid EVM address: ${String(activeAccount)}`,
      { activeAccount }
    );
  }

  if (activeAccount.toLowerCase() !== context.userAddress.toLowerCase()) {
    context.onStateChange?.('user_error', {
      expected: context.userAddress,
      actual: activeAccount,
    });
    throw new RobexAppError(
      'USER_ERROR',
      `Active wallet account ${activeAccount} does not match expected sender ${context.userAddress}`,
      { expected: context.userAddress, actual: activeAccount }
    );
  }

  // Step (c): Device clock vs latest block timestamp skew <= +-30s
  let latestBlockRaw: unknown;
  try {
    latestBlockRaw = await context.rpcCall('eth_getBlockByNumber', ['latest', false]);
  } catch (err: unknown) {
    context.onStateChange?.('provider_error', { error: err });
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Failed to fetch latest block header: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  if (
    !latestBlockRaw ||
    typeof latestBlockRaw !== 'object' ||
    !('timestamp' in latestBlockRaw)
  ) {
    context.onStateChange?.('provider_error');
    throw new RobexAppError(
      'PROVIDER_ERROR',
      'Latest block header does not contain timestamp field'
    );
  }

  let blockTimestamp: bigint;
  try {
    blockTimestamp = parseBigIntValue(
      (latestBlockRaw as { timestamp: unknown }).timestamp,
      'blockTimestamp'
    );
  } catch (err: unknown) {
    context.onStateChange?.('provider_error', { error: err });
    throw err;
  }

  const localNowSeconds = getExecutionTimestamp();
  const clockSkewSeconds = Math.abs(Number(localNowSeconds - blockTimestamp));

  if (clockSkewSeconds > 30) {
    context.onStateChange?.('expired', {
      localNow: localNowSeconds.toString(),
      blockTimestamp: blockTimestamp.toString(),
      skewSeconds: clockSkewSeconds,
    });
    throw new RobexAppError(
      'USER_ERROR',
      `Device clock is out of sync with latest block by ${clockSkewSeconds}s (exceeds +-30s limit). Vui lòng kiểm tra đồng hồ thiết bị.`,
      {
        localNow: localNowSeconds.toString(),
        blockTimestamp: blockTimestamp.toString(),
        skewSeconds: clockSkewSeconds,
      }
    );
  }

  // Step (d): Build calldata using core
  let buildResult;
  try {
    buildResult = buildUniversalRouterSwapCalldata({
      chainId: params.chainId,
      amountIn: params.amountIn,
      amountOut: params.amountOut,
      slippage: params.slippage,
      deadline: params.deadline,
      poolKey: params.poolKey,
    });
  } catch (err: unknown) {
    if (err instanceof RobexAppError) {
      if (err.code === 'CHAIN_ERROR') {
        context.onStateChange?.('wrong_network', { error: err });
      } else if (err.details?.subcode === 'EXPIRED_DEADLINE') {
        context.onStateChange?.('expired', { error: err });
      } else {
        context.onStateChange?.('user_error', { error: err });
      }
    } else {
      context.onStateChange?.('user_error', { error: err });
    }
    throw err;
  }

  // Step (e): runPreSendChecks via wallet RPC
  let preSendResult;
  try {
    preSendResult = await runPreSendChecks({
      chainId: params.chainId,
      userAddress: context.userAddress,
      amountIn: params.amountIn,
      amountOut: params.amountOut,
      slippage: params.slippage,
      calldata: buildResult.data,
      rpcCall: context.rpcCall,
    });
  } catch (err: unknown) {
    if (err instanceof RobexAppError) {
      const details = err.details as Record<string, unknown> | undefined;
      if (
        details?.subcode === 'INSUFFICIENT_BALANCE' ||
        (details && 'userBalance' in details && ('requiredEth' in details || 'amountIn' in details))
      ) {
        context.onStateChange?.('insufficient_balance', { error: err });
      } else if (err.code === 'CHAIN_ERROR') {
        context.onStateChange?.('wrong_network', { error: err });
      } else if (
        details?.subcode === 'EXPIRED_DEADLINE' ||
        (details && 'deadline' in details && 'maxDeadline' in details)
      ) {
        context.onStateChange?.('expired', { error: err });
      } else {
        context.onStateChange?.('provider_error', { error: err });
      }
    } else {
      context.onStateChange?.('provider_error', { error: err });
    }
    throw err;
  }

  // Generation check right before wallet confirmation / prompt
  if (context.isSessionActive && !context.isSessionActive()) {
    context.onStateChange?.('cancelled', {
      error: 'Swap transaction was cancelled before submission due to account, chain, or wallet change',
    });
    throw new RobexAppError(
      'SECURITY_ERROR',
      'Swap transaction was cancelled before submission due to account, chain, or wallet change'
    );
  }

  // Step (f): Calculate gas = estimatedGas * 120 / 100
  const gasLimit = (preSendResult.estimatedGas * 120n) / 100n;

  // Parameters taken STRICTLY from core output; no nonce, no message signing, no approve
  // Payload has exactly {from, to, value, data, gas, chainId} (S-02)
  const txPayload = {
    from: context.userAddress,
    to: buildResult.to,
    value: toHex(buildResult.value),
    data: buildResult.data,
    gas: toHex(gasLimit),
    chainId: toHex(UNISWAP_V4_TESTNET_QUOTE.chainId),
  };

  // Transition to wallet_confirmation
  context.onStateChange?.('wallet_confirmation');

  let txHash: string;
  try {
    txHash = await context.sendTransaction(txPayload);
  } catch (err: unknown) {
    if (isUserRejectionError(err)) {
      context.onStateChange?.('rejected', { error: err });
      throw new RobexAppError(
        'USER_ERROR',
        'User rejected transaction in wallet (code 4001)',
        { error: err }
      );
    }
    context.onStateChange?.('provider_error', { error: err });
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Wallet failed to submit transaction: ${err instanceof Error ? err.message : String(err)}`,
      { error: err }
    );
  }

  // QA-04: the tx hash must match /^0x[0-9a-fA-F]{64}$/, else provider_error.
  const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
  if (!txHash || typeof txHash !== 'string' || !TX_HASH_REGEX.test(txHash)) {
    context.onStateChange?.('provider_error', { rawHash: txHash });
    throw new RobexAppError('PROVIDER_ERROR', 'Wallet returned invalid transaction hash', {
      rawHash: txHash,
    });
  }

  // Fetch nonce from eth_getTransactionByHash after submission. If unavailable, keep entry and do not guess.
  let txNonce: number | null = null;
  try {
    const txObj = await context.rpcCall('eth_getTransactionByHash', [txHash]);
    if (txObj && typeof txObj === 'object' && 'nonce' in txObj) {
      const rawNonce = (txObj as { nonce: unknown }).nonce;
      const parsed = Number(parseHexQuantity(rawNonce));
      if (Number.isSafeInteger(parsed)) {
        txNonce = parsed;
      }
    }
  } catch {
    txNonce = null;
  }

  // Record pending entry at "submitted": {txHash, from, chainId, nonce, recordedAt}
  recordPendingSwapInternal({
    txHash,
    from: context.userAddress.toLowerCase(),
    chainId: UNISWAP_V4_TESTNET_QUOTE.chainId,
    nonce: txNonce,
    recordedAt: Date.now(),
  });

  // Transition to submitted: A tx hash alone is NEVER success!
  context.onStateChange?.('submitted', { txHash });

  // Transition to pending
  context.onStateChange?.('pending', { txHash });

  // QA-05: after "submitted", wrap everything in try/catch; never lose the hash; return {state:'anomaly'|'provider_error', txHash} and keep the guard.
  try {
    // Receipt polling via wallet provider
    const pollResult = await pollTransactionReceipt(
      context.rpcCall,
      txHash,
      context.pollOptions
    );

    if (pollResult.status === 'timeout') {
      // 180s timeout state that keeps the hash (not considered a failure)
      context.onStateChange?.('timeout', { txHash });
      return {
        state: 'timeout',
        txHash,
      };
    }

    // A receipt for that hash has arrived: clear entry (1)
    clearPendingSwapInternal(context.userAddress.toLowerCase(), UNISWAP_V4_TESTNET_QUOTE.chainId);

    // Verify receipt (S-04, S-05, QA-06)
    const verification = verifyAndParseReceipt(pollResult.receipt, {
      expectedRouter: buildResult.to,
      userAddress: context.userAddress,
      amountOutMinimum: buildResult.amountOutMinimum,
      expectedTxHash: txHash,
      usdgAddress: UNISWAP_V4_TESTNET_QUOTE.usdg,
    });

    let parsedBlockNumber = 0n;
    try {
      if (verification.receipt?.blockNumber != null) {
        parsedBlockNumber = BigInt(verification.receipt.blockNumber);
      }
    } catch {
      parsedBlockNumber = 0n;
    }

    const receiptObj = {
      status: verification.receipt?.status != null ? String(verification.receipt.status) : '0x0',
      to: verification.receipt?.to ?? '',
      from: verification.receipt?.from ?? '',
      blockNumber: parsedBlockNumber,
      transactionHash: verification.receipt?.transactionHash ?? txHash,
      logs: Array.isArray(verification.receipt?.logs) ? verification.receipt.logs : [],
    };

    if (!verification.confirmed) {
      if (verification.status === 'anomaly') {
        context.onStateChange?.('anomaly', {
          txHash,
          receipt: verification.receipt,
          anomalyReason: verification.anomalyReason,
          error: verification.error,
        });
        return {
          state: 'anomaly',
          txHash,
          receipt: receiptObj,
          anomalyReason: verification.anomalyReason,
          error: verification.error,
          hasDecodeFailure: verification.hasDecodeFailure,
        };
      }

      context.onStateChange?.('reverted', {
        txHash,
        receipt: verification.receipt,
        error: verification.error,
      });
      return {
        state: 'reverted',
        txHash,
        receipt: receiptObj,
        error: verification.error,
        hasDecodeFailure: verification.hasDecodeFailure,
      };
    }

    context.onStateChange?.('confirmed', {
      txHash,
      receipt: verification.receipt,
      actualAmountReceived: verification.actualAmountReceived,
      amountOutMinimum: buildResult.amountOutMinimum,
      slippageExceeded: verification.slippageExceeded,
    });

    return {
      state: 'confirmed',
      txHash,
      receipt: receiptObj,
      actualAmountReceived: verification.actualAmountReceived,
      amountOutMinimum: buildResult.amountOutMinimum,
      slippageExceeded: verification.slippageExceeded,
      hasDecodeFailure: verification.hasDecodeFailure,
    };
  } catch (err: unknown) {
    // QA-05: Catch-all post-submission keeps the guard and returns provider_error with txHash
    context.onStateChange?.('provider_error', { txHash, error: err });
    return {
      state: 'provider_error',
      txHash,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
