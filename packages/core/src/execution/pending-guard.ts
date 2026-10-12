import { parseHexQuantity } from '../quote/balance-fill.js';
import { RobexAppError } from '../errors/index.js';

export interface PendingSwapEntry {
  txHash: string;
  from: string; // address lowercase
  chainId: number;
  nonce: number | null;
  recordedAt: number;
}

const memoryPendingStore = new Map<string, PendingSwapEntry>();

function getStorageKey(from: string, chainId: number): string {
  return `robex_pending_swap:${from.toLowerCase()}:${chainId}`;
}

function readStorage(from: string, chainId: number): PendingSwapEntry | null {
  const key = getStorageKey(from, chainId);
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && typeof parsed.txHash === 'string') {
          return parsed as PendingSwapEntry;
        }
      }
    }
  } catch {
    // Ignore localStorage access errors
  }
  return memoryPendingStore.get(key) ?? null;
}

function writeStorage(entry: PendingSwapEntry): void {
  const key = getStorageKey(entry.from, entry.chainId);
  memoryPendingStore.set(key, entry);
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(key, JSON.stringify(entry));
    }
  } catch {
    // Ignore localStorage access errors
  }
}

function removeStorage(from: string, chainId: number): void {
  const key = getStorageKey(from, chainId);
  memoryPendingStore.delete(key);
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore localStorage access errors
  }
}

/**
 * Internal function to record pending swap entry.
 * Not exported to application code.
 */
export function recordPendingSwapInternal(entry: PendingSwapEntry): void {
  writeStorage(entry);
}

/**
 * Internal function to clear pending swap entry.
 * Not exported to application code.
 */
export function clearPendingSwapInternal(from: string, chainId: number): void {
  removeStorage(from, chainId);
}

/**
 * Read-only status query for current pending swap.
 * Survives page reloads, new tabs, and adapter replacement.
 */
export function getPendingSwapStatus(from: string, chainId: number): PendingSwapEntry | null {
  return readStorage(from, chainId);
}

/**
 * Checks pending swap guard on send attempt.
 * Clears entry if:
 * 1. A receipt arrives for that hash (any status)
 * 2. eth_getTransactionCount(from, 'latest') > recorded nonce and hash has no receipt
 * Returns pending entry if still unresolved, or null if clear.
 */
export async function checkAndResolvePendingSwap(
  from: string,
  chainId: number,
  rpcCall: (method: string, params: unknown[]) => Promise<unknown>
): Promise<PendingSwapEntry | null> {
  const pending = readStorage(from, chainId);
  if (!pending) {
    return null;
  }

  // 1. Check if a receipt for that hash arrives (any status)
  let receipt: unknown = null;
  try {
    receipt = await rpcCall('eth_getTransactionReceipt', [pending.txHash]);
  } catch {
    // Transient RPC failure: keep pending
  }

  if (
    receipt &&
    typeof receipt === 'object' &&
    'status' in (receipt as Record<string, unknown>)
  ) {
    removeStorage(from, chainId);
    return null;
  }

  // 2. Check if nonce has passed on-chain (replaced or cancelled)
  if (pending.nonce !== null && Number.isSafeInteger(pending.nonce)) {
    try {
      const countRaw = await rpcCall('eth_getTransactionCount', [pending.from, 'latest']);
      const currentNonce = Number(parseHexQuantity(countRaw));
      if (currentNonce > pending.nonce) {
        removeStorage(from, chainId);
        return null;
      }
    } catch {
      // Keep entry on count check error
    }
  }

  return pending;
}

/**
 * Dedicated core function to clear an expired dropped pending swap with user explicit confirmation.
 * Requirements:
 * 1. User must explicitly confirm (userConfirmed: true)
 * 2. More than 10 minutes have passed since recordedAt
 * 3. eth_getTransactionByHash returns null (dropped from mempool)
 */
export async function clearDroppedPendingSwapAfterConfirmation(params: {
  from: string;
  chainId: number;
  rpcCall: (method: string, params: unknown[]) => Promise<unknown>;
  userConfirmed: boolean;
}): Promise<boolean> {
  if (!params.userConfirmed) {
    throw new RobexAppError('SECURITY_ERROR', 'User explicit confirmation is required to clear pending swap');
  }

  const pending = readStorage(params.from, params.chainId);
  if (!pending) {
    return true;
  }

  const elapsedMs = Date.now() - pending.recordedAt;
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  if (elapsedMs < TEN_MINUTES_MS) {
    throw new RobexAppError(
      'SECURITY_ERROR',
      `Cannot clear pending swap before 10 minutes have elapsed (elapsed: ${Math.floor(elapsedMs / 1000)}s, required: 600s)`
    );
  }

  let txObj: unknown = null;
  try {
    txObj = await params.rpcCall('eth_getTransactionByHash', [pending.txHash]);
  } catch (err) {
    throw new RobexAppError(
      'PROVIDER_ERROR',
      `Failed to verify transaction status via eth_getTransactionByHash: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (txObj !== null) {
    throw new RobexAppError(
      'SECURITY_ERROR',
      `Transaction ${pending.txHash} is still recognized by node. Cannot clear while in mempool.`
    );
  }

  // Check receipt once more
  try {
    const receipt = await params.rpcCall('eth_getTransactionReceipt', [pending.txHash]);
    if (receipt && typeof receipt === 'object' && 'status' in (receipt as Record<string, unknown>)) {
      removeStorage(params.from, params.chainId);
      return true;
    }
  } catch {
    // Ignore receipt check error
  }

  removeStorage(params.from, params.chainId);
  return true;
}
