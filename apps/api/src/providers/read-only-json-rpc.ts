import { RobexAppError } from '@robex/core';

const READ_METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call']);

export interface ReadOnlyRpc {
  request(method: string, params: readonly unknown[]): Promise<unknown>;
  readonly rpcUrl?: string;
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
  }

  public async request(method: string, params: readonly unknown[]): Promise<unknown> {
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
      throw new RobexAppError('PROVIDER_ERROR', `The read-only RPC request failed: ${err instanceof Error ? err.message : 'unknown error'}`, {
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
