import { RobexAppError } from '@robex/core';

const READ_METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call']);

export interface ReadOnlyRpc {
  request(method: string, params: readonly unknown[]): Promise<unknown>;
  readonly rpcUrl?: string;
}

/** Upstream errors meaning a load-balanced node has not seen the pinned block yet (QA F-02). */
const BLOCK_NOT_SYNCED = /unsupported block number|header not found|unknown block|block not found/i;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * QA F-03: the RPC URL must be https (plain http only for a loopback host used
 * in local tests). The error never echoes the configured URL.
 */
export function assertReadOnlyRpcUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('The read-only RPC URL is not a valid URL. Check ROBINHOOD_TESTNET_RPC_URL.');
  }
  const loopback = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopback) {
    throw new Error('The read-only RPC URL must use https://. Check ROBINHOOD_TESTNET_RPC_URL.');
  }
}

interface RpcErrorBody {
  code?: number;
  message?: string;
}

export class JsonRpcReadOnlyProvider implements ReadOnlyRpc {
  constructor(
    public readonly rpcUrl: string,
    private readonly timeoutMs = 10_000,
  ) {
    if (!rpcUrl) throw new Error('Read-only RPC URL is required');
    assertReadOnlyRpcUrl(rpcUrl);
  }

  public async request(method: string, params: readonly unknown[]): Promise<unknown> {
    try {
      return await this.requestOnce(method, params);
    } catch (err) {
      // QA F-02: retry once with the same params (same pinned blockTag) when a
      // node behind the load balancer has not synced that block yet.
      if (!(err instanceof RobexAppError) || err.details?.reason !== 'BLOCK_NOT_SYNCED') throw err;
      return this.requestOnce(method, params);
    }
  }

  private async requestOnce(method: string, params: readonly unknown[]): Promise<unknown> {
    if (!READ_METHODS.has(method)) {
      throw new RobexAppError(
        'SECURITY_ERROR',
        `RPC method ${method} is not allowed. The quote provider is read-only.`,
        { reason: 'RPC_METHOD_REJECTED', method },
      );
    }

    let response: Response;
    try {
      response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new RobexAppError('PROVIDER_ERROR', 'The read-only RPC request timed out.', {
          reason: 'TIMEOUT',
          timeoutMs: this.timeoutMs,
        });
      }
      // QA F-03: never pass the upstream message through; it can contain the configured URL.
      throw new RobexAppError('PROVIDER_ERROR', 'The read-only RPC request failed. Check the RPC configuration and try again.', {
        reason: 'RPC_UNAVAILABLE',
      });
    }

    if (response.status === 429) {
      throw new RobexAppError('PROVIDER_ERROR', 'The read-only RPC rate limit was reached. Retry shortly.', {
        reason: 'RATE_LIMIT',
        status: 429,
      });
    }
    if (!response.ok) {
      throw new RobexAppError('PROVIDER_ERROR', `The read-only RPC returned HTTP ${response.status}.`, {
        reason: 'RPC_HTTP',
        status: response.status,
      });
    }

    let body: { result?: unknown; error?: RpcErrorBody };
    try {
      body = await response.json() as { result?: unknown; error?: RpcErrorBody };
    } catch {
      throw new RobexAppError('PROVIDER_ERROR', 'The read-only RPC returned a response that was not JSON.', {
        reason: 'BAD_RPC_RESPONSE',
      });
    }

    if (body.error) {
      const message = body.error.message || 'RPC error';
      const rateLimited = body.error.code === 429 || /rate limit|too many/i.test(message);
      if (rateLimited) {
        throw new RobexAppError('PROVIDER_ERROR', 'The read-only RPC rate limit was reached. Retry shortly.', {
          reason: 'RATE_LIMIT',
          code: body.error.code,
        });
      }
      if (BLOCK_NOT_SYNCED.test(message)) {
        throw new RobexAppError('PROVIDER_ERROR', 'The RPC node has not synced the latest block yet. Please refresh the quote.', {
          reason: 'BLOCK_NOT_SYNCED',
          code: body.error.code,
          method,
        });
      }
      const reverted = body.error.code === 3 || /revert/i.test(message);
      throw new RobexAppError('PROVIDER_ERROR', `RPC error: ${message}`, {
        reason: reverted ? 'RPC_REVERT' : 'RPC_ERROR',
        code: body.error.code,
        method,
      });
    }

    return body.result;
  }
}
