import { describe, it, expect } from 'vitest';
import {
  MockWalletAdapter,
  FAKE_MOCK_TX_HASH,
  isMockSendExecutionAllowed,
} from '../src/wallet/mock-wallet-adapter.js';
import {
  InjectedWalletAdapter,
  getPendingSwapHash,
} from '../src/wallet/injected-wallet-adapter.js';

describe('Mock Wallet Production Safety & Double-Submit Lock (C1 PR 2A)', () => {
  it('enforces mock send is strictly prohibited in production under all conditions', () => {
    // In production, even if VITE_ENABLE_MOCK_WALLET is 'true', execution is prohibited
    expect(isMockSendExecutionAllowed(false, 'true')).toBe(false);
    expect(isMockSendExecutionAllowed(false, 'false')).toBe(false);
    expect(isMockSendExecutionAllowed(false, undefined)).toBe(false);

    // In dev, only permitted when flag is explicitly 'true'
    expect(isMockSendExecutionAllowed(true, 'false')).toBe(false);
    expect(isMockSendExecutionAllowed(true, undefined)).toBe(false);
    expect(isMockSendExecutionAllowed(true, 'true')).toBe(true);
  });

  it('rejects MockWalletAdapter.sendSwapTransaction when not permitted by environment', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();

    // Default test environment does not set VITE_ENABLE_MOCK_WALLET='true'
    await expect(
      adapter.sendSwapTransaction({
        chainId: 46630,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
      })
    ).rejects.toThrow('DISABLED_IN_PRODUCTION');
  });

  it('returns clearly fake hash in DEV mock mode when permitted', async () => {
    const origEnv = process.env.VITE_ENABLE_MOCK_WALLET;
    try {
      process.env.VITE_ENABLE_MOCK_WALLET = 'true';
      const adapter = new MockWalletAdapter();
      await adapter.connect();

      const result = await adapter.sendSwapTransaction({
        chainId: 46630,
        amountIn: 500_000_000_000n,
        amountOut: 1128n,
      });

      expect(result.state).toBe('confirmed');
      expect(result.txHash).toBe(FAKE_MOCK_TX_HASH);
      expect(result.txHash).toBe(
        '0x000000000000000000000000000000000000000000000000000000000000f4ce'
      );
      // Clearly fake hash pattern
      expect(result.txHash?.endsWith('f4ce')).toBe(true);
    } finally {
      process.env.VITE_ENABLE_MOCK_WALLET = origEnv;
    }
  });

  it('enforces one in-flight tx per session double-submit lock on InjectedWalletAdapter', async () => {
    let callCount = 0;
    let unblockSendTransaction: () => void = () => {};
    const sendTxGate = new Promise<void>((resolve) => {
      unblockSendTransaction = resolve;
    });

    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0xb626';
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return ['0x8e94699c825a15275e720549aCE1D37612dD0d71'];
        }
        if (method === 'eth_getBlockByNumber') {
          return { timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) };
        }
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0';
        if (method === 'eth_gasPrice') return '0x989680';
        if (method === 'eth_sendTransaction') {
          callCount++;
          // Hold until unblocked
          await sendTxGate;
          return '0x0000000000000000000000000000000000000000000000000000000000000001';
        }
        if (method === 'eth_getTransactionReceipt') {
          return {
            status: '0x1',
            to: '0x8876789976decbfcbbbe364623c63652db8c0904',
            from: '0x8e94699c825a15275e720549aCE1D37612dD0d71',
            blockNumber: '0x1',
            transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
            logs: [],
          };
        }
        throw new Error(`Unexpected method ${method}`);
      },
      on: () => {},
      removeListener: () => {},
    };

    const adapter = new InjectedWalletAdapter(mockProvider as any);
    await adapter.connect();

    const swapParams = {
      chainId: 46630,
      amountIn: 500_000_000_000n,
      amountOut: 1128n,
    };

    // First call starts in flight
    const firstPromise = adapter.sendSwapTransaction(swapParams);

    // Second call starts while first is in flight
    await expect(
      adapter.sendSwapTransaction(swapParams)
    ).rejects.toThrow('A swap transaction is already in flight in this session');

    // Unblock the first call
    unblockSendTransaction();
    await firstPromise;

    // After first call finishes, subsequent call is permitted
    expect(callCount).toBe(1);
  });

  it('enforces session-level pending-hash guard across timeout & adapter replacement on reconnect (S-03)', async () => {
    const userAddress = '0x8e94699c825a15275e720549aCE1D37612dD0d71';
    try {
      localStorage.clear();
    } catch {
      // Ignore if localStorage is unavailable
    }

    let receiptAvailable = false;
    let txCount = 0;
    const timeoutHash = '0x0000000000000000000000000000000000000000000000000000000000000002';
    const secondHash = '0x0000000000000000000000000000000000000000000000000000000000000003';

    const createMockProvider = () => ({
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_chainId') return '0xb626'; // 46630
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return [userAddress];
        }
        if (method === 'eth_getBlockByNumber') {
          return { timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) };
        }
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x203a0';
        if (method === 'eth_gasPrice') return '0x989680';
        if (method === 'eth_sendTransaction') {
          txCount++;
          return txCount === 1 ? timeoutHash : secondHash;
        }
        if (method === 'eth_getTransactionReceipt') {
          const queriedHash = params?.[0];
          if (queriedHash === timeoutHash) {
            if (!receiptAvailable) return null;
            return {
              status: '0x1',
              to: '0x8876789976decbfcbbbe364623c63652db8c0904',
              from: userAddress,
              blockNumber: '0x1',
              transactionHash: timeoutHash,
              logs: [],
            };
          }
          if (queriedHash === secondHash) {
            return {
              status: '0x1',
              to: '0x8876789976decbfcbbbe364623c63652db8c0904',
              from: userAddress,
              blockNumber: '0x2',
              transactionHash: secondHash,
              logs: [],
            };
          }
          return null;
        }
        throw new Error(`Unexpected method ${method}`);
      },
      on: () => {},
      removeListener: () => {},
    });

    const swapParams = {
      chainId: 46630,
      amountIn: 500_000_000_000n,
      amountOut: 1128n,
    };

    // 1. Adapter 1 sends swap transaction, times out polling for receipt
    const adapter1 = new InjectedWalletAdapter(createMockProvider() as any, null, {
      timeoutMs: 15,
      pollIntervalMs: 5,
    });
    await adapter1.connect();

    const result1 = await adapter1.sendSwapTransaction(swapParams);
    expect(result1.state).toBe('timeout');
    expect(result1.txHash).toBe(timeoutHash);

    // Verify pending hash was recorded at session level
    expect(getPendingSwapHash(userAddress, 46630)).toBe(timeoutHash);

    // 2. Simulate reconnect: replace adapter instance (Adapter 2)
    const adapter2 = new InjectedWalletAdapter(createMockProvider() as any, null, {
      timeoutMs: 15,
      pollIntervalMs: 5,
    });
    await adapter2.connect();

    // 3. Adapter 2 attempts a new swap while timeoutHash is still unmined -> MUST be blocked
    await expect(adapter2.sendSwapTransaction(swapParams)).rejects.toThrow(
      /A (?:prior )?swap transaction.*(?:timed out and is still pending on-chain|is currently being confirmed on-chain)/
    );

    // 4. Now the transaction gets mined and receipt becomes available
    receiptAvailable = true;

    // 5. Adapter 2 attempts the swap again -> unblocks and proceeds
    const result2 = await adapter2.sendSwapTransaction(swapParams);
    expect(result2.state).toBe('confirmed');
    expect(result2.txHash).toBe(secondHash);
    expect(getPendingSwapHash(userAddress, 46630)).toBeNull();
  });

  it('strictly excludes mock send execution code and fake hash from production dist bundle (QA-10)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const distDir = path.resolve(__dirname, '../dist/assets');
    if (!fs.existsSync(distDir)) {
      return;
    }
    const jsFiles = fs.readdirSync(distDir).filter((f: string) => f.endsWith('.js'));
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distDir, file), 'utf8');
      expect(content).not.toContain('0x000000000000000000000000000000000000000000000000000000000000f4ce');
      expect(content).not.toContain('DISABLED_IN_PRODUCTION');
      expect(content).not.toContain('Connect the mock wallet on Robinhood Chain Testnet to execute a swap.');
    }
  });
});
