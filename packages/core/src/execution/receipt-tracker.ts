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
  status: string | number | bigint;
  to: string;
  from: string;
  blockNumber: string | number | bigint;
  transactionHash: string;
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
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

  for (const log of logs) {
    if (!log.address || log.address.toLowerCase() !== usdgLower) continue;
    if (!log.topics || log.topics.length < 3) continue;
    if (log.topics[0]?.toLowerCase() !== topicLower) continue;

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
  const expectedRouter = options.expectedRouter ?? UNISWAP_V4_TESTNET_QUOTE.universalRouter;
  const userLower = options.userAddress.toLowerCase();
  const routerLower = expectedRouter.toLowerCase();

  // 1. Check status
  if (!isReceiptSuccessful(receipt.status)) {
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

  // 2. Check transactionHash match (S-05)
  if (
    options.expectedTxHash &&
    (!receipt.transactionHash ||
      receipt.transactionHash.toLowerCase() !== options.expectedTxHash.toLowerCase())
  ) {
    const reason = `Receipt transactionHash ${receipt.transactionHash} does not match expected txHash ${options.expectedTxHash}`;
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

  // 3. Check "to" address match (S-04)
  if (!receipt.to || receipt.to.toLowerCase() !== routerLower) {
    const reason = `Receipt destination ${receipt.to} does not match Universal Router ${expectedRouter}`;
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

  // 4. Check "from" address match (S-04)
  if (!receipt.from || receipt.from.toLowerCase() !== userLower) {
    const reason = `Receipt sender ${receipt.from} does not match expected user ${options.userAddress}`;
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

  // 5. Sum USDG Transfer logs (S-08)
  const logResult = sumUsdgTransferLogsDetailed(
    receipt.logs ?? [],
    options.userAddress,
    options.usdgAddress ?? UNISWAP_V4_TESTNET_QUOTE.usdg
  );

  // 6. Flag if received < amountOutMinimum
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
