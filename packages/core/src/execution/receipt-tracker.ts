import {
  decodeEventLog,
  toEventSelector,
  type Hex,
} from 'viem';
import { UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';

export const TRANSFER_EVENT_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
] as const;

/**
 * ERC20 Transfer event topic computed dynamically via viem (C1 PR 2A).
 * Never hard-typed per 00-truthfulness.
 */
export const TRANSFER_EVENT_TOPIC: Hex = toEventSelector('Transfer(address,address,uint256)');

export interface RawTransactionReceipt {
  status?: string | number | bigint | null;
  to: string;
  from: string;
  blockNumber?: string | number | bigint | null;
  transactionHash: string;
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
  }> | unknown;
}

export interface VerifyReceiptOptions {
  expectedRouter?: string;
  userAddress: string;
  amountOutMinimum: bigint;
  expectedTxHash?: string;
  usdgAddress?: string;
}

export interface VerifiedReceiptResult {
  confirmed: boolean;
  status: 'confirmed' | 'reverted' | 'anomaly';
  actualAmountReceived: bigint;
  amountOutMinimum: bigint;
  slippageExceeded: boolean;
  receipt: RawTransactionReceipt;
  hasDecodeFailure?: boolean;
  anomalyReason?: string;
  error?: string;
}

export function isReceiptSuccessful(status: string | number | bigint): boolean {
  if (typeof status === 'string') {
    return status.toLowerCase() === '0x1' || status === '1';
  }
  if (typeof status === 'number') {
    return status === 1;
  }
  if (typeof status === 'bigint') {
    return status === 1n;
  }
  return false;
}

export interface SumUsdgLogsResult {
  totalReceived: bigint;
  decodeFailedLogsCount: number;
}

/**
 * Sums USDG Transfer event logs where recipient matches user address.
 * Decodes logs using dynamically computed viem Transfer selector.
 * S-08: Skips and flags logs whose decode fails; never adds raw data.
 */
export function sumUsdgTransferLogsDetailed(
  logs: Array<{ address: string; topics: string[]; data: string }> = [],
  userAddress: string,
  usdgTokenAddress: string = UNISWAP_V4_TESTNET_QUOTE.usdg
): SumUsdgLogsResult {
  let totalReceived = 0n;
  let decodeFailedLogsCount = 0;
  const userLower = userAddress.toLowerCase();
  const usdgLower = usdgTokenAddress.toLowerCase();
  const topicLower = TRANSFER_EVENT_TOPIC.toLowerCase();

  if (!Array.isArray(logs)) {
    return { totalReceived: 0n, decodeFailedLogsCount: 1 };
  }

  for (const log of logs) {
    if (!log || typeof log !== 'object') {
      decodeFailedLogsCount++;
      continue;
    }
    if (typeof log.address !== 'string' || log.address.toLowerCase() !== usdgLower) continue;
    if (!Array.isArray(log.topics) || log.topics.length < 3) continue;
    if (typeof log.topics[0] !== 'string' || log.topics[0]?.toLowerCase() !== topicLower) continue;
    if (typeof log.data !== 'string') {
      decodeFailedLogsCount++;
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: TRANSFER_EVENT_ABI,
        data: (log.data.startsWith('0x') ? log.data : `0x${log.data}`) as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (
        decoded.eventName === 'Transfer' &&
        decoded.args &&
        typeof decoded.args.to === 'string' &&
        decoded.args.to.toLowerCase() === userLower
      ) {
        totalReceived += decoded.args.value as bigint;
      }
    } catch {
      // S-08: Strictly skip malformed log and flag decode failure. Never add raw data.
      decodeFailedLogsCount++;
    }
  }

  return { totalReceived, decodeFailedLogsCount };
}

export function sumUsdgTransferLogs(
  logs: Array<{ address: string; topics: string[]; data: string }> = [],
  userAddress: string,
  usdgTokenAddress: string = UNISWAP_V4_TESTNET_QUOTE.usdg
): bigint {
  return sumUsdgTransferLogsDetailed(logs, userAddress, usdgTokenAddress).totalReceived;
}

/**
 * Verifies transaction receipt per C1 PR 2A:
 * - status must be 0x1
 * - to must match Universal Router
 * - from must match user address
 * - transactionHash must match expected txHash (S-05)
 * - never overwrites receipt.status; uses anomaly state for mismatched 0x1 receipts (S-04)
 * - sums USDG Transfer logs to user; skips decode failures (S-08)
 * - flags actual received < minOut
 */
export function verifyAndParseReceipt(
  receipt: RawTransactionReceipt,
  options: VerifyReceiptOptions
): VerifiedReceiptResult {
  if (!receipt || typeof receipt !== 'object') {
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: 'Receipt is not an object',
      error: 'Receipt is not an object',
    };
  }

  const expectedRouter = options.expectedRouter ?? UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const userLower = options.userAddress.toLowerCase();
  const routerLower = expectedRouter.toLowerCase();

  // 1. Check transactionHash match FIRST (S-05, QA-06)
  if (
    options.expectedTxHash &&
    (!receipt.transactionHash ||
      typeof receipt.transactionHash !== 'string' ||
      receipt.transactionHash.toLowerCase() !== options.expectedTxHash.toLowerCase())
  ) {
    const reason = `Receipt transactionHash ${String(receipt.transactionHash)} does not match expected txHash ${options.expectedTxHash}`;
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  // 2. Check "to" address match (S-04)
  if (!receipt.to || typeof receipt.to !== 'string' || receipt.to.toLowerCase() !== routerLower) {
    const reason = `Receipt destination ${String(receipt.to)} does not match Universal Router ${expectedRouter}`;
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  // 3. Check "from" address match (S-04)
  if (!receipt.from || typeof receipt.from !== 'string' || receipt.from.toLowerCase() !== userLower) {
    const reason = `Receipt sender ${String(receipt.from)} does not match expected user ${options.userAddress}`;
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  // 4. Check status (QA-06): 0x0 is reverted, 0x1 is confirmed, anything else is anomaly
  const statusStr = receipt.status != null ? String(receipt.status).toLowerCase() : '';
  const isZero = statusStr === '0x0' || statusStr === '0';
  const isOne = statusStr === '0x1' || statusStr === '1';

  if (isZero) {
    return {
      confirmed: false,
      status: 'reverted',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      error: 'Transaction reverted on-chain (receipt status is 0x0)',
    };
  }

  if (!isOne) {
    const reason = `Receipt status "${String(receipt.status)}" is neither 0x1 (success) nor 0x0 (revert)`;
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  // 5. Check blockNumber (QA-15, QA-19, QA-20): blockNumber must be a valid integer > 0; '', -1, 'abc' -> anomaly
  if (receipt.blockNumber == null) {
    const reason = 'Receipt blockNumber is null or missing';
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  if (typeof receipt.blockNumber === 'string' && receipt.blockNumber.trim() === '') {
    const reason = 'Receipt blockNumber is empty';
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  let parsedBlockNumber: bigint;
  try {
    parsedBlockNumber = BigInt(receipt.blockNumber);
  } catch {
    const reason = `Receipt blockNumber "${String(receipt.blockNumber)}" cannot be parsed as BigInt`;
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  if (parsedBlockNumber <= 0n) {
    const reason = `Receipt blockNumber "${String(receipt.blockNumber)}" is not a positive integer`;
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  // 6. Check logs (QA-15): logs is not an array -> anomaly, never confirmed. Do not force logs = []
  if (!Array.isArray(receipt.logs)) {
    const reason = 'Receipt logs field is not an array';
    return {
      confirmed: false,
      status: 'anomaly',
      actualAmountReceived: 0n,
      amountOutMinimum: options.amountOutMinimum,
      slippageExceeded: true,
      receipt,
      anomalyReason: reason,
      error: reason,
    };
  }

  // 7. Status is 0x1, blockNumber is valid, logs is Array! Sum USDG Transfer logs (S-08)
  const logResult = sumUsdgTransferLogsDetailed(
    receipt.logs,
    options.userAddress,
    options.usdgAddress ?? UNISWAP_V4_TESTNET_QUOTE.usdg
  );

  // 8. Flag if received < amountOutMinimum
  const slippageExceeded = logResult.totalReceived < options.amountOutMinimum;

  return {
    confirmed: true,
    status: 'confirmed',
    actualAmountReceived: logResult.totalReceived,
    amountOutMinimum: options.amountOutMinimum,
    slippageExceeded,
    receipt,
    hasDecodeFailure: logResult.decodeFailedLogsCount > 0,
  };
}

export interface PollReceiptOptions {
  timeoutMs?: number; // 180,000ms default
  pollIntervalMs?: number; // 2,000ms default
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type PollReceiptResult =
  | { status: 'found'; receipt: RawTransactionReceipt }
  | { status: 'timeout'; txHash: string };

/**
 * Polls eth_getTransactionReceipt with a 180s timeout window.
 * If 180s expires without a receipt, returns timeout keeping txHash (does not mark as failure).
 */
export async function pollTransactionReceipt(
  rpcCall: (method: string, params: unknown[]) => Promise<unknown>,
  txHash: string,
  options: PollReceiptOptions = {}
): Promise<PollReceiptResult> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const startTime = clock();

  while (clock() - startTime < timeoutMs) {
    try {
      const receiptRaw = await rpcCall('eth_getTransactionReceipt', [txHash]);
      if (receiptRaw && typeof receiptRaw === 'object' && 'status' in receiptRaw) {
        const receipt = receiptRaw as RawTransactionReceipt;
        return { status: 'found', receipt };
      }
    } catch {
      // Transient RPC read errors while polling; continue until timeout
    }

    const elapsed = clock() - startTime;
    if (elapsed + pollIntervalMs >= timeoutMs) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  // 180s timeout state that keeps the hash
  return { status: 'timeout', txHash };
}
